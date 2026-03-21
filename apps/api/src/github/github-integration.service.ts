import { Injectable } from '@nestjs/common';
import {
  GitHubCredentialMode,
  GitHubIntegrationStatus,
  GitHubWriteScope,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { decryptSecretValue, encryptSecretValue } from '../common/secret-crypto';
import { badRequest, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';

const githubIntegrationSelect = {
  id: true,
  tenantId: true,
  workspaceId: true,
  suiteId: true,
  credentialMode: true,
  status: true,
  repoOwner: true,
  repoName: true,
  defaultBranch: true,
  workflowPath: true,
  allowedWriteScope: true,
  pullRequestRequired: true,
  secretRef: true,
  encryptedSecretJson: true,
  appId: true,
  appSlug: true,
  installationId: true,
  healthSummaryJson: true,
  lastValidatedAt: true,
  secretRotatedAt: true,
  webhookSecretRef: true,
  webhookSecretEncryptedJson: true,
  webhookSecretRotatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ValidationSummary = {
  status: GitHubIntegrationStatus;
  message: string;
  defaultBranch: string | null;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  } | null;
};

@Injectable()
export class GitHubIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async upsertIntegration(
    workspaceId: string,
    suiteId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      select: { id: true, tenantId: true },
    });

    if (!suite || suite.tenantId !== tenantId) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }

    const existing = await this.prisma.gitHubSuiteIntegration.findUnique({
      where: { suiteId },
      select: githubIntegrationSelect,
    });

    const parsed = this.readIntegrationBody(body, existing);
    const validation = await this.validateConfig({
      credentialMode: parsed.credentialMode,
      repoOwner: parsed.repoOwner,
      repoName: parsed.repoName,
      defaultBranch: parsed.defaultBranch,
      allowedWriteScope: parsed.allowedWriteScope,
      token: parsed.validationToken,
    });

    const rotatedAt = parsed.credentialChanged ? new Date() : existing?.secretRotatedAt ?? null;
    const record = existing
      ? await this.prisma.gitHubSuiteIntegration.update({
          where: { suiteId },
          data: {
            credentialMode: parsed.credentialMode,
            repoOwner: parsed.repoOwner,
            repoName: parsed.repoName,
            defaultBranch: validation.defaultBranch ?? parsed.defaultBranch,
            workflowPath: parsed.workflowPath,
            allowedWriteScope: parsed.allowedWriteScope,
            pullRequestRequired: parsed.pullRequestRequired,
            secretRef: parsed.secretRef,
            encryptedSecretJson: parsed.encryptedSecretJson,
            appId: parsed.appId,
            appSlug: parsed.appSlug,
            installationId: parsed.installationId,
            status: validation.status,
            healthSummaryJson: validation as Prisma.InputJsonValue,
            lastValidatedAt: new Date(),
            secretRotatedAt: rotatedAt,
            secretRotatedByUserId: parsed.credentialChanged ? auth.user.id : existing.secretRotatedAt ? auth.user.id : null,
            webhookSecretRef: parsed.webhookSecretRef,
            webhookSecretEncryptedJson: parsed.webhookSecretEncryptedJson,
            webhookSecretRotatedAt: parsed.webhookSecretChanged
              ? new Date()
              : existing.webhookSecretRotatedAt ?? null,
          },
          select: githubIntegrationSelect,
        })
      : await this.prisma.gitHubSuiteIntegration.create({
          data: {
            tenantId,
            workspaceId,
            suiteId,
            credentialMode: parsed.credentialMode,
            repoOwner: parsed.repoOwner,
            repoName: parsed.repoName,
            defaultBranch: validation.defaultBranch ?? parsed.defaultBranch,
            workflowPath: parsed.workflowPath,
            allowedWriteScope: parsed.allowedWriteScope,
            pullRequestRequired: parsed.pullRequestRequired,
            secretRef: parsed.secretRef,
            encryptedSecretJson: parsed.encryptedSecretJson,
            appId: parsed.appId,
            appSlug: parsed.appSlug,
            installationId: parsed.installationId,
            status: validation.status,
            healthSummaryJson: validation as Prisma.InputJsonValue,
            lastValidatedAt: new Date(),
            secretRotatedAt: parsed.credentialChanged ? new Date() : null,
            secretRotatedByUserId: parsed.credentialChanged ? auth.user.id : null,
            webhookSecretRef: parsed.webhookSecretRef,
            webhookSecretEncryptedJson: parsed.webhookSecretEncryptedJson,
            webhookSecretRotatedAt: parsed.webhookSecretChanged ? new Date() : null,
          },
          select: githubIntegrationSelect,
        });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: existing ? 'github_integration.updated' : 'github_integration.connected',
      entityType: 'github_suite_integration',
      entityId: record.id,
      requestId,
      metadataJson: {
        suiteId,
        repoOwner: record.repoOwner,
        repoName: record.repoName,
        credentialMode: record.credentialMode,
        status: record.status,
        secretSource: parsed.secretRef ? 'external_ref' : parsed.encryptedSecretJson ? 'encrypted_store' : 'none',
        webhookSecretSource: parsed.webhookSecretRef
          ? 'external_ref'
          : parsed.webhookSecretEncryptedJson
            ? 'encrypted_store'
            : 'none',
      },
    });

    return this.toIntegrationSummary(record);
  }

  async revalidateIntegration(
    workspaceId: string,
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const existing = await this.prisma.gitHubSuiteIntegration.findFirst({
      where: { suiteId, workspaceId },
      select: githubIntegrationSelect,
    });

    if (!existing) {
      throw notFound('GITHUB_INTEGRATION_NOT_FOUND', 'GitHub integration was not found for this suite.');
    }

    const token = existing.encryptedSecretJson ? this.tryDecryptToken(existing.encryptedSecretJson) : null;
    const validation = await this.validateConfig({
      credentialMode: existing.credentialMode,
      repoOwner: existing.repoOwner,
      repoName: existing.repoName,
      defaultBranch: existing.defaultBranch,
      allowedWriteScope: existing.allowedWriteScope,
      token,
    });

    const updated = await this.prisma.gitHubSuiteIntegration.update({
      where: { suiteId },
      data: {
        status: validation.status,
        defaultBranch: validation.defaultBranch ?? existing.defaultBranch,
        healthSummaryJson: validation as Prisma.InputJsonValue,
        lastValidatedAt: new Date(),
      },
      select: githubIntegrationSelect,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'github_integration.validated',
      entityType: 'github_suite_integration',
      entityId: updated.id,
      requestId,
      metadataJson: {
        suiteId,
        status: updated.status,
        validationMessage: validation.message,
      },
    });

    return this.toIntegrationSummary(updated);
  }

  async deleteIntegration(
    workspaceId: string,
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const existing = await this.prisma.gitHubSuiteIntegration.findFirst({
      where: { suiteId, workspaceId },
      select: { id: true, repoOwner: true, repoName: true },
    });

    if (!existing) {
      throw notFound('GITHUB_INTEGRATION_NOT_FOUND', 'GitHub integration was not found for this suite.');
    }

    await this.prisma.gitHubSuiteIntegration.delete({ where: { suiteId } });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'github_integration.disconnected',
      entityType: 'github_suite_integration',
      entityId: existing.id,
      requestId,
      metadataJson: {
        suiteId,
        repoOwner: existing.repoOwner,
        repoName: existing.repoName,
      },
    });

    return { removed: true };
  }

  toIntegrationSummary(record: Prisma.GitHubSuiteIntegrationGetPayload<{ select: typeof githubIntegrationSelect }>) {
    const health = this.asRecord(record.healthSummaryJson);
    const permissions = this.asRecord(health?.['permissions']);

    return {
      id: record.id,
      suiteId: record.suiteId,
      credentialMode: record.credentialMode,
      status: record.status,
      repoOwner: record.repoOwner,
      repoName: record.repoName,
      defaultBranch: record.defaultBranch,
      workflowPath: record.workflowPath,
      allowedWriteScope: record.allowedWriteScope,
      pullRequestRequired: record.pullRequestRequired,
      secretRef: record.secretRef,
      hasStoredSecret: Boolean(record.encryptedSecretJson || record.secretRef),
      appId: record.appId,
      appSlug: record.appSlug,
      installationId: record.installationId,
      webhookEndpoint: this.buildWebhookEndpoint(record.suiteId),
      hasWebhookSecret: Boolean(record.webhookSecretEncryptedJson || record.webhookSecretRef),
      webhookSecretRotatedAt: record.webhookSecretRotatedAt,
      secretRotatedAt: record.secretRotatedAt,
      lastValidatedAt: record.lastValidatedAt,
      validationMessage: typeof health?.['message'] === 'string' ? health['message'] : null,
      permissions: permissions
        ? {
            admin: Boolean(permissions['admin']),
            push: Boolean(permissions['push']),
            pull: Boolean(permissions['pull']),
          }
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private readIntegrationBody(
    body: Record<string, unknown>,
    existing: Prisma.GitHubSuiteIntegrationGetPayload<{ select: typeof githubIntegrationSelect }> | null,
  ) {
    const credentialMode = this.readCredentialMode(body['credentialMode']);
    const repoOwner = this.readRepoSegment(body['repoOwner'], 'repoOwner');
    const repoName = this.readRepoSegment(body['repoName'], 'repoName');
    const defaultBranch = this.readOptionalString(body['defaultBranch']) ?? existing?.defaultBranch ?? 'main';
    const workflowPath = this.readOptionalString(body['workflowPath']) ?? null;
    const allowedWriteScope = this.readWriteScope(body['allowedWriteScope']);
    const pullRequestRequired = this.readBoolean(body['pullRequestRequired'], existing?.pullRequestRequired ?? true);
    const secretRef = this.readOptionalString(body['secretRef']) ?? null;
    const secretValue = this.readOptionalString(body['secretValue']);
    const webhookSecretRef = this.readOptionalString(body['webhookSecretRef']) ?? null;
    const webhookSecretValue = this.readOptionalString(body['webhookSecretValue']);
    const appId = this.readOptionalString(body['appId']) ?? null;
    const appSlug = this.readOptionalString(body['appSlug']) ?? null;
    const installationId = this.readOptionalString(body['installationId']) ?? null;

    if (credentialMode === GitHubCredentialMode.GITHUB_APP && !installationId) {
      throw badRequest('GITHUB_INSTALLATION_ID_REQUIRED', 'GitHub App mode requires an installationId.');
    }

    if (!secretValue && !secretRef && !existing?.encryptedSecretJson && !existing?.secretRef) {
      throw badRequest('GITHUB_CREDENTIAL_REQUIRED', 'Provide either a secret value or a secret reference.');
    }

    if (
      !webhookSecretValue &&
      !webhookSecretRef &&
      !existing?.webhookSecretEncryptedJson &&
      !existing?.webhookSecretRef
    ) {
      throw badRequest(
        'GITHUB_WEBHOOK_SECRET_REQUIRED',
        'Provide either a webhook secret value or a webhook secret reference.',
      );
    }

    const encryptedSecretJson = secretValue
      ? encryptSecretValue(secretValue)
      : existing?.encryptedSecretJson ?? null;
    const webhookSecretEncryptedJson = webhookSecretValue
      ? encryptSecretValue(webhookSecretValue)
      : existing?.webhookSecretEncryptedJson ?? null;
    const validationToken = secretValue ?? (existing?.encryptedSecretJson ? this.tryDecryptToken(existing.encryptedSecretJson) : null);

    return {
      credentialMode,
      repoOwner,
      repoName,
      defaultBranch,
      workflowPath,
      allowedWriteScope,
      pullRequestRequired,
      secretRef,
      encryptedSecretJson,
      webhookSecretRef,
      webhookSecretEncryptedJson,
      validationToken,
      appId,
      appSlug,
      installationId,
      credentialChanged:
        Boolean(secretValue) ||
        secretRef !== (existing?.secretRef ?? null) ||
        credentialMode !== (existing?.credentialMode ?? credentialMode) ||
        installationId !== (existing?.installationId ?? null),
      webhookSecretChanged:
        Boolean(webhookSecretValue) || webhookSecretRef !== (existing?.webhookSecretRef ?? null),
    };
  }

  async getOperationalIntegrationBySuiteId(suiteId: string) {
    const integration = await this.prisma.gitHubSuiteIntegration.findUnique({
      where: { suiteId },
      select: githubIntegrationSelect,
    });

    if (!integration) {
      throw notFound('GITHUB_INTEGRATION_NOT_FOUND', 'GitHub integration was not found for this suite.');
    }

    return {
      record: integration,
      token: integration.encryptedSecretJson ? this.tryDecryptToken(integration.encryptedSecretJson) : null,
      webhookSecret: integration.webhookSecretEncryptedJson
        ? this.tryDecryptToken(integration.webhookSecretEncryptedJson)
        : null,
    };
  }

  private async validateConfig(input: {
    credentialMode: GitHubCredentialMode;
    repoOwner: string;
    repoName: string;
    defaultBranch: string;
    allowedWriteScope: GitHubWriteScope;
    token: string | null;
  }): Promise<ValidationSummary> {
    if (!input.token) {
      return {
        status: GitHubIntegrationStatus.INVALID,
        message:
          'GitHub configuration saved, but live validation requires a resolvable token. Add a secret value in this environment or provide external secret resolution before publishing.',
        defaultBranch: input.defaultBranch,
        permissions: null,
      };
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${input.repoOwner}/${input.repoName}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${input.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Selora-GitHub-Integration-Validator',
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          status: GitHubIntegrationStatus.INVALID,
          message: 'GitHub rejected the stored credential or the credential does not have access to this repository.',
          defaultBranch: input.defaultBranch,
          permissions: null,
        };
      }

      if (response.status === 404) {
        return {
          status: GitHubIntegrationStatus.INVALID,
          message: 'The configured repository could not be found or is not visible to the stored credential.',
          defaultBranch: input.defaultBranch,
          permissions: null,
        };
      }

      if (!response.ok) {
        return {
          status: GitHubIntegrationStatus.INVALID,
          message: `GitHub validation failed with status ${response.status}.`,
          defaultBranch: input.defaultBranch,
          permissions: null,
        };
      }

      const payload = (await response.json()) as {
        default_branch?: string;
        permissions?: {
          admin?: boolean;
          push?: boolean;
          pull?: boolean;
        };
      };
      const permissions = {
        admin: Boolean(payload.permissions?.admin),
        push: Boolean(payload.permissions?.push),
        pull: Boolean(payload.permissions?.pull),
      };

      if (input.allowedWriteScope !== GitHubWriteScope.READ_ONLY && !permissions.push) {
        return {
          status: GitHubIntegrationStatus.INVALID,
          message: 'The stored credential can read the repository but does not have push permission for the selected write scope.',
          defaultBranch: payload.default_branch ?? input.defaultBranch,
          permissions,
        };
      }

      return {
        status: GitHubIntegrationStatus.CONNECTED,
        message:
          input.credentialMode === GitHubCredentialMode.GITHUB_APP
            ? 'GitHub App linkage validated against the configured repository.'
            : 'PAT linkage validated against the configured repository.',
        defaultBranch: payload.default_branch ?? input.defaultBranch,
        permissions,
      };
    } catch {
      return {
        status: GitHubIntegrationStatus.INVALID,
        message: 'GitHub validation could not reach the remote API. Check network access and retry.',
        defaultBranch: input.defaultBranch,
        permissions: null,
      };
    }
  }

  private readCredentialMode(value: unknown) {
    if (value === GitHubCredentialMode.PAT || value === GitHubCredentialMode.GITHUB_APP) {
      return value;
    }

    throw badRequest('GITHUB_CREDENTIAL_MODE_INVALID', 'credentialMode must be PAT or GITHUB_APP.');
  }

  private readWriteScope(value: unknown) {
    if (
      value === GitHubWriteScope.READ_ONLY ||
      value === GitHubWriteScope.BRANCH_PUSH ||
      value === GitHubWriteScope.PULL_REQUESTS
    ) {
      return value;
    }

    throw badRequest(
      'GITHUB_WRITE_SCOPE_INVALID',
      'allowedWriteScope must be READ_ONLY, BRANCH_PUSH, or PULL_REQUESTS.',
    );
  }

  private readRepoSegment(value: unknown, fieldName: string) {
    const raw = this.readNonEmptyString(value, fieldName);
    if (!/^[A-Za-z0-9_.-]+$/.test(raw)) {
      throw badRequest('GITHUB_REPOSITORY_INVALID', `${fieldName} contains unsupported characters.`);
    }

    return raw;
  }

  private readNonEmptyString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('GITHUB_FIELD_REQUIRED', `${fieldName} is required.`);
    }

    return value.trim();
  }

  private readOptionalString(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }

    return fallback;
  }

  private tryDecryptToken(value: string) {
    try {
      return decryptSecretValue(value);
    } catch {
      return null;
    }
  }

  private buildWebhookEndpoint(suiteId: string) {
    const baseUrl = (process.env['API_PUBLIC_ORIGIN'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000').replace(/\/$/, '');
    return `${baseUrl}/api/v1/github/webhooks/${suiteId}`;
  }

  private asRecord(value: unknown) {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }
}