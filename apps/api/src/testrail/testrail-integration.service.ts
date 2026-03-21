import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TestRailCaseLinkStatus,
  TestRailIntegrationStatus,
  TestRailSyncPolicy,
  TestRailSyncRunStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { decryptSecretValue, encryptSecretValue } from '../common/secret-crypto';
import { badRequest, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';

const testRailIntegrationSelect = {
  id: true,
  tenantId: true,
  workspaceId: true,
  suiteId: true,
  baseUrl: true,
  projectId: true,
  suiteIdExternal: true,
  sectionId: true,
  username: true,
  secretRef: true,
  encryptedApiKeyJson: true,
  status: true,
  syncPolicy: true,
  healthSummaryJson: true,
  lastValidatedAt: true,
  lastSyncedAt: true,
  secretRotatedAt: true,
  secretRotatedByUserId: true,
  createdAt: true,
  updatedAt: true,
  syncRuns: {
    select: {
      id: true,
      status: true,
      scope: true,
      totalCount: true,
      syncedCount: true,
      failedCount: true,
      summary: true,
      startedAt: true,
      finishedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 1,
  },
} as const;

type ValidationSummary = {
  status: TestRailIntegrationStatus;
  message: string;
};

@Injectable()
export class TestRailIntegrationService {
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
    await this.assertSuiteAccess(workspaceId, suiteId, tenantId);

    const existing = await this.prisma.testRailSuiteIntegration.findUnique({
      where: { suiteId },
      select: testRailIntegrationSelect,
    });
    const parsed = this.readIntegrationBody(body, existing);
    const validation = await this.validateConfig({
      baseUrl: parsed.baseUrl,
      projectId: parsed.projectId,
      suiteIdExternal: parsed.suiteIdExternal,
      username: parsed.username,
      apiKey: parsed.validationApiKey,
    });

    const record = existing
      ? await this.prisma.testRailSuiteIntegration.update({
          where: { suiteId },
          data: {
            baseUrl: parsed.baseUrl,
            projectId: parsed.projectId,
            suiteIdExternal: parsed.suiteIdExternal,
            sectionId: parsed.sectionId,
            username: parsed.username,
            secretRef: parsed.secretRef,
            encryptedApiKeyJson: parsed.encryptedApiKeyJson,
            status: validation.status,
            syncPolicy: parsed.syncPolicy,
            healthSummaryJson: validation as Prisma.InputJsonValue,
            lastValidatedAt: new Date(),
            secretRotatedAt: parsed.secretChanged ? new Date() : existing.secretRotatedAt,
            secretRotatedByUserId: parsed.secretChanged ? auth.user.id : existing.secretRotatedByUserId,
          },
          select: testRailIntegrationSelect,
        })
      : await this.prisma.testRailSuiteIntegration.create({
          data: {
            tenantId,
            workspaceId,
            suiteId,
            baseUrl: parsed.baseUrl,
            projectId: parsed.projectId,
            suiteIdExternal: parsed.suiteIdExternal,
            sectionId: parsed.sectionId,
            username: parsed.username,
            secretRef: parsed.secretRef,
            encryptedApiKeyJson: parsed.encryptedApiKeyJson,
            status: validation.status,
            syncPolicy: parsed.syncPolicy,
            healthSummaryJson: validation as Prisma.InputJsonValue,
            lastValidatedAt: new Date(),
            secretRotatedAt: parsed.secretChanged ? new Date() : null,
            secretRotatedByUserId: parsed.secretChanged ? auth.user.id : null,
          },
          select: testRailIntegrationSelect,
        });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: existing ? 'testrail_integration.updated' : 'testrail_integration.connected',
      entityType: 'testrail_suite_integration',
      entityId: record.id,
      requestId,
      metadataJson: {
        suiteId,
        projectId: record.projectId,
        suiteIdExternal: record.suiteIdExternal,
        status: record.status,
      },
    });

    return this.toIntegrationSummary(record);
  }

  async validateIntegration(
    workspaceId: string,
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const integration = await this.prisma.testRailSuiteIntegration.findFirst({
      where: { suiteId, workspaceId },
      select: testRailIntegrationSelect,
    });

    if (!integration || integration.tenantId !== tenantId) {
      throw notFound('TESTRAIL_INTEGRATION_NOT_FOUND', 'TestRail integration was not found for this suite.');
    }

    const validation = await this.validateConfig({
      baseUrl: integration.baseUrl,
      projectId: integration.projectId,
      suiteIdExternal: integration.suiteIdExternal,
      username: integration.username,
      apiKey: integration.encryptedApiKeyJson ? this.tryDecryptApiKey(integration.encryptedApiKeyJson) : null,
    });

    const updated = await this.prisma.testRailSuiteIntegration.update({
      where: { suiteId },
      data: {
        status: validation.status,
        healthSummaryJson: validation as Prisma.InputJsonValue,
        lastValidatedAt: new Date(),
      },
      select: testRailIntegrationSelect,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'testrail_integration.validated',
      entityType: 'testrail_suite_integration',
      entityId: updated.id,
      requestId,
      metadataJson: {
        suiteId,
        status: updated.status,
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
    const integration = await this.prisma.testRailSuiteIntegration.findFirst({
      where: { suiteId, workspaceId },
      select: { id: true, tenantId: true },
    });

    if (!integration || integration.tenantId !== tenantId) {
      throw notFound('TESTRAIL_INTEGRATION_NOT_FOUND', 'TestRail integration was not found for this suite.');
    }

    await this.prisma.testRailSuiteIntegration.delete({ where: { suiteId } });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'testrail_integration.disconnected',
      entityType: 'testrail_suite_integration',
      entityId: integration.id,
      requestId,
      metadataJson: { suiteId },
    });

    return { removed: true };
  }

  async upsertCaseLink(
    workspaceId: string,
    suiteId: string,
    testId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const integration = await this.requireIntegration(workspaceId, suiteId, tenantId);
    const canonicalTest = await this.prisma.canonicalTest.findFirst({
      where: { id: testId, workspaceId, suiteId },
      select: { id: true, name: true },
    });

    if (!canonicalTest) {
      throw notFound('CANONICAL_TEST_NOT_FOUND', 'Canonical test was not found for this suite.');
    }

    const externalCaseId = this.readOptionalString(body['externalCaseId']);
    if (!externalCaseId) {
      const existing = await this.prisma.externalTestCaseLink.findUnique({
        where: { canonicalTestId: testId },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.externalTestCaseLink.delete({ where: { canonicalTestId: testId } });
      }

      await this.auditService.record({
        tenantId,
        workspaceId,
        actorUserId: auth.user.id,
        eventType: 'testrail_case_link.removed',
        entityType: 'external_test_case_link',
        entityId: existing?.id ?? testId,
        requestId,
        metadataJson: { suiteId, canonicalTestId: testId },
      });

      return { removed: true };
    }

    const ownerEmail = this.readOptionalString(body['ownerEmail']) ?? null;
    const link = await this.prisma.externalTestCaseLink.upsert({
      where: { canonicalTestId: testId },
      create: {
        workspaceId,
        suiteId,
        canonicalTestId: testId,
        integrationId: integration.id,
        externalCaseId,
        ownerEmail,
        status: TestRailCaseLinkStatus.MAPPED,
      },
      update: {
        suiteId,
        integrationId: integration.id,
        externalCaseId,
        ownerEmail,
        status: TestRailCaseLinkStatus.MAPPED,
        lastError: null,
        retryEligible: true,
      },
      select: {
        id: true,
        canonicalTestId: true,
        externalCaseId: true,
        status: true,
        ownerEmail: true,
        titleSnapshot: true,
        sectionNameSnapshot: true,
        lastSyncedAt: true,
        lastError: true,
        retryEligible: true,
        updatedAt: true,
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'testrail_case_link.updated',
      entityType: 'external_test_case_link',
      entityId: link.id,
      requestId,
      metadataJson: {
        suiteId,
        canonicalTestId: testId,
        externalCaseId,
      },
    });

    return link;
  }

  async syncSuite(
    workspaceId: string,
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const integration = await this.requireIntegration(workspaceId, suiteId, tenantId);
    this.assertSyncEnabled(integration);
    const apiKey = integration.encryptedApiKeyJson
      ? this.tryDecryptApiKey(integration.encryptedApiKeyJson)
      : null;

    if (!apiKey) {
      throw badRequest(
        'TESTRAIL_CREDENTIAL_UNRESOLVED',
        'The stored TestRail credential cannot be resolved in this environment.',
      );
    }

    const links = await this.prisma.externalTestCaseLink.findMany({
      where: { suiteId, integrationId: integration.id },
      include: {
        canonicalTest: {
          select: { id: true, name: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const syncRun = await this.prisma.testRailSyncRun.create({
      data: {
        tenantId,
        workspaceId,
        suiteId,
        integrationId: integration.id,
        startedByUserId: auth.user.id,
        scope: 'suite',
        totalCount: links.length,
      },
      select: {
        id: true,
      },
    });

    let syncedCount = 0;
    let failedCount = 0;

    for (const link of links) {
      try {
        const payload = await this.fetchTestRail(
          integration.baseUrl,
          `/index.php?/api/v2/get_case/${encodeURIComponent(link.externalCaseId)}`,
          integration.username,
          apiKey,
        );
        const caseData = (await payload.json()) as Record<string, unknown>;
        await this.prisma.externalTestCaseLink.update({
          where: { id: link.id },
          data: {
            status: TestRailCaseLinkStatus.SYNCED,
            titleSnapshot: typeof caseData['title'] === 'string' ? caseData['title'] : link.canonicalTest.name,
            sectionNameSnapshot: this.readOptionalString(caseData['section_id']) ?? link.sectionNameSnapshot,
            syncSnapshotJson: caseData as Prisma.InputJsonValue,
            lastSyncedAt: new Date(),
            lastError: null,
            retryEligible: true,
          },
        });
        syncedCount += 1;
      } catch (error) {
        await this.prisma.externalTestCaseLink.update({
          where: { id: link.id },
          data: {
            status: TestRailCaseLinkStatus.FAILED,
            lastError: error instanceof Error ? error.message : 'TestRail sync failed.',
            retryEligible: true,
          },
        });
        failedCount += 1;
      }
    }

    const status =
      failedCount === 0
        ? TestRailSyncRunStatus.SUCCESS
        : syncedCount > 0
          ? TestRailSyncRunStatus.PARTIAL
          : TestRailSyncRunStatus.FAILED;
    const summary =
      links.length === 0
        ? 'No mapped TestRail cases were available to sync.'
        : `Synced ${syncedCount} case${syncedCount === 1 ? '' : 's'} with ${failedCount} failure${failedCount === 1 ? '' : 's'}.`;

    await this.prisma.$transaction([
      this.prisma.testRailSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status,
          syncedCount,
          failedCount,
          summary,
          finishedAt: new Date(),
        },
      }),
      this.prisma.testRailSuiteIntegration.update({
        where: { suiteId },
        data: {
          lastSyncedAt: new Date(),
        },
      }),
    ]);

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'testrail_sync.completed',
      entityType: 'testrail_sync_run',
      entityId: syncRun.id,
      requestId,
      metadataJson: {
        suiteId,
        syncedCount,
        failedCount,
        status,
      },
    });

    const refreshed = await this.prisma.testRailSuiteIntegration.findUnique({
      where: { suiteId },
      select: testRailIntegrationSelect,
    });

    if (!refreshed) {
      throw notFound('TESTRAIL_INTEGRATION_NOT_FOUND', 'TestRail integration was not found for this suite.');
    }

    return {
      integration: this.toIntegrationSummary(refreshed),
      syncRun: refreshed.syncRuns[0]
        ? {
            id: refreshed.syncRuns[0].id,
            status: refreshed.syncRuns[0].status,
            scope: refreshed.syncRuns[0].scope,
            totalCount: refreshed.syncRuns[0].totalCount,
            syncedCount: refreshed.syncRuns[0].syncedCount,
            failedCount: refreshed.syncRuns[0].failedCount,
            summary: refreshed.syncRuns[0].summary,
            startedAt: refreshed.syncRuns[0].startedAt,
            finishedAt: refreshed.syncRuns[0].finishedAt,
          }
        : null,
    };
  }

  async retryCaseLink(
    workspaceId: string,
    suiteId: string,
    testId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const integration = await this.requireIntegration(workspaceId, suiteId, tenantId);
    this.assertSyncEnabled(integration);
    const apiKey = integration.encryptedApiKeyJson
      ? this.tryDecryptApiKey(integration.encryptedApiKeyJson)
      : null;

    if (!apiKey) {
      throw badRequest(
        'TESTRAIL_CREDENTIAL_UNRESOLVED',
        'The stored TestRail credential cannot be resolved in this environment.',
      );
    }

    const link = await this.prisma.externalTestCaseLink.findFirst({
      where: { suiteId, canonicalTestId: testId, integrationId: integration.id },
      include: { canonicalTest: { select: { name: true } } },
    });

    if (!link) {
      throw notFound('TESTRAIL_CASE_LINK_NOT_FOUND', 'TestRail case link was not found for this test.');
    }

    try {
      const response = await this.fetchTestRail(
        integration.baseUrl,
        `/index.php?/api/v2/get_case/${encodeURIComponent(link.externalCaseId)}`,
        integration.username,
        apiKey,
      );
      const caseData = (await response.json()) as Record<string, unknown>;
      const updated = await this.prisma.externalTestCaseLink.update({
        where: { id: link.id },
        data: {
          status: TestRailCaseLinkStatus.SYNCED,
          titleSnapshot: typeof caseData['title'] === 'string' ? caseData['title'] : link.canonicalTest.name,
          syncSnapshotJson: caseData as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
          lastError: null,
          retryEligible: true,
        },
        select: {
          id: true,
          canonicalTestId: true,
          externalCaseId: true,
          status: true,
          ownerEmail: true,
          titleSnapshot: true,
          sectionNameSnapshot: true,
          lastSyncedAt: true,
          lastError: true,
          retryEligible: true,
          updatedAt: true,
        },
      });

      await this.auditService.record({
        tenantId,
        workspaceId,
        actorUserId: auth.user.id,
        eventType: 'testrail_case_link.retried',
        entityType: 'external_test_case_link',
        entityId: updated.id,
        requestId,
        metadataJson: {
          suiteId,
          canonicalTestId: testId,
          externalCaseId: updated.externalCaseId,
        },
      });

      return updated;
    } catch (error) {
      const updated = await this.prisma.externalTestCaseLink.update({
        where: { id: link.id },
        data: {
          status: TestRailCaseLinkStatus.FAILED,
          lastError: error instanceof Error ? error.message : 'TestRail retry failed.',
          retryEligible: true,
        },
        select: {
          id: true,
          canonicalTestId: true,
          externalCaseId: true,
          status: true,
          ownerEmail: true,
          titleSnapshot: true,
          sectionNameSnapshot: true,
          lastSyncedAt: true,
          lastError: true,
          retryEligible: true,
          updatedAt: true,
        },
      });

      await this.auditService.record({
        tenantId,
        workspaceId,
        actorUserId: auth.user.id,
        eventType: 'testrail_case_link.retry_failed',
        entityType: 'external_test_case_link',
        entityId: updated.id,
        requestId,
        metadataJson: {
          suiteId,
          canonicalTestId: testId,
          externalCaseId: updated.externalCaseId,
        },
      });

      return updated;
    }
  }

  toIntegrationSummary(
    record: Prisma.TestRailSuiteIntegrationGetPayload<{ select: typeof testRailIntegrationSelect }>,
  ) {
    const health = this.asRecord(record.healthSummaryJson);
    const lastSyncRun = record.syncRuns[0] ?? null;

    return {
      id: record.id,
      suiteId: record.suiteId,
      status: record.status,
      baseUrl: record.baseUrl,
      projectId: record.projectId,
      suiteIdExternal: record.suiteIdExternal,
      sectionId: record.sectionId,
      username: record.username,
      secretRef: record.secretRef,
      hasStoredSecret: Boolean(record.encryptedApiKeyJson || record.secretRef),
      syncPolicy: record.syncPolicy,
      lastValidatedAt: record.lastValidatedAt,
      lastSyncedAt: record.lastSyncedAt,
      secretRotatedAt: record.secretRotatedAt,
      validationMessage: typeof health?.['message'] === 'string' ? health['message'] : null,
      lastSyncRun: lastSyncRun
        ? {
            id: lastSyncRun.id,
            status: lastSyncRun.status,
            scope: lastSyncRun.scope,
            totalCount: lastSyncRun.totalCount,
            syncedCount: lastSyncRun.syncedCount,
            failedCount: lastSyncRun.failedCount,
            summary: lastSyncRun.summary,
            startedAt: lastSyncRun.startedAt,
            finishedAt: lastSyncRun.finishedAt,
          }
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async assertSuiteAccess(workspaceId: string, suiteId: string, tenantId: string) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      select: { id: true, tenantId: true },
    });

    if (!suite || suite.tenantId !== tenantId) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }
  }

  private async requireIntegration(workspaceId: string, suiteId: string, tenantId: string) {
    const integration = await this.prisma.testRailSuiteIntegration.findFirst({
      where: { suiteId, workspaceId },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        suiteId: true,
        baseUrl: true,
        projectId: true,
        suiteIdExternal: true,
        sectionId: true,
        username: true,
        secretRef: true,
        encryptedApiKeyJson: true,
        status: true,
        suite: {
          select: {
            id: true,
            rolloutStage: true,
            testRailSyncEnabled: true,
          },
        },
      },
    });

    if (!integration || integration.tenantId !== tenantId) {
      throw notFound('TESTRAIL_INTEGRATION_NOT_FOUND', 'TestRail integration was not found for this suite.');
    }

    return integration;
  }

  private assertSyncEnabled(integration: {
    suite: {
      id: string;
      rolloutStage: string;
      testRailSyncEnabled: boolean;
    } | null;
  }) {
    if (integration.suite?.testRailSyncEnabled) {
      return;
    }

    throw badRequest(
      'TESTRAIL_SYNC_DISABLED',
      `TestRail sync is disabled for this suite while rollout is in ${integration.suite?.rolloutStage ?? 'INTERNAL'} stage.`,
    );
  }

  private readIntegrationBody(
    body: Record<string, unknown>,
    existing:
      | Prisma.TestRailSuiteIntegrationGetPayload<{ select: typeof testRailIntegrationSelect }>
      | null,
  ) {
    const baseUrl = this.readBaseUrl(body['baseUrl']) ?? existing?.baseUrl;
    const projectId = this.readNonEmptyString(body['projectId'], 'projectId');
    const suiteIdExternal = this.readOptionalString(body['suiteIdExternal']) ?? null;
    const sectionId = this.readOptionalString(body['sectionId']) ?? null;
    const username = this.readNonEmptyString(body['username'], 'username');
    const syncPolicy = this.readSyncPolicy(body['syncPolicy']);
    const secretRef = this.readOptionalString(body['secretRef']) ?? null;
    const apiKey = this.readOptionalString(body['apiKey']);

    if (!baseUrl) {
      throw badRequest('TESTRAIL_BASE_URL_REQUIRED', 'baseUrl is required.');
    }

    if (!apiKey && !secretRef && !existing?.encryptedApiKeyJson && !existing?.secretRef) {
      throw badRequest(
        'TESTRAIL_CREDENTIAL_REQUIRED',
        'Provide either a TestRail API key value or a secret reference.',
      );
    }

    return {
      baseUrl,
      projectId,
      suiteIdExternal,
      sectionId,
      username,
      syncPolicy,
      secretRef,
      encryptedApiKeyJson: apiKey ? encryptSecretValue(apiKey) : existing?.encryptedApiKeyJson ?? null,
      validationApiKey: apiKey ?? (existing?.encryptedApiKeyJson ? this.tryDecryptApiKey(existing.encryptedApiKeyJson) : null),
      secretChanged: Boolean(apiKey) || secretRef !== (existing?.secretRef ?? null),
    };
  }

  private async validateConfig(input: {
    baseUrl: string;
    projectId: string;
    suiteIdExternal: string | null;
    username: string;
    apiKey: string | null;
  }): Promise<ValidationSummary> {
    if (!input.apiKey) {
      return {
        status: TestRailIntegrationStatus.INVALID,
        message:
          'TestRail configuration saved, but live validation requires a resolvable API key in this environment.',
      };
    }

    try {
      const projectResponse = await this.fetchTestRail(
        input.baseUrl,
        `/index.php?/api/v2/get_project/${encodeURIComponent(input.projectId)}`,
        input.username,
        input.apiKey,
      );
      if (!projectResponse.ok) {
        return {
          status: TestRailIntegrationStatus.INVALID,
          message: `TestRail project validation failed with status ${projectResponse.status}.`,
        };
      }

      if (input.suiteIdExternal) {
        const suiteResponse = await this.fetchTestRail(
          input.baseUrl,
          `/index.php?/api/v2/get_suite/${encodeURIComponent(input.suiteIdExternal)}`,
          input.username,
          input.apiKey,
        );
        if (!suiteResponse.ok) {
          return {
            status: TestRailIntegrationStatus.INVALID,
            message: `TestRail suite validation failed with status ${suiteResponse.status}.`,
          };
        }
      }

      return {
        status: TestRailIntegrationStatus.CONNECTED,
        message: 'TestRail linkage validated against the configured project.',
      };
    } catch {
      return {
        status: TestRailIntegrationStatus.INVALID,
        message: 'TestRail validation could not reach the remote API. Check network access and retry.',
      };
    }
  }

  private fetchTestRail(baseUrl: string, path: string, username: string, apiKey: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${apiKey}`, 'utf8').toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Selora-TestRail-Integration',
      },
    });
  }

  private readBaseUrl(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    try {
      const parsed = new URL(value.trim());
      return parsed.toString().replace(/\/$/, '');
    } catch {
      throw badRequest('TESTRAIL_BASE_URL_INVALID', 'baseUrl must be a valid URL.');
    }
  }

  private readNonEmptyString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('TESTRAIL_FIELD_REQUIRED', `${fieldName} is required.`);
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

  private readSyncPolicy(value: unknown) {
    if (value === TestRailSyncPolicy.MANUAL || value === undefined) {
      return TestRailSyncPolicy.MANUAL;
    }

    throw badRequest('TESTRAIL_SYNC_POLICY_INVALID', 'syncPolicy must be MANUAL.');
  }

  private tryDecryptApiKey(value: string) {
    try {
      return decryptSecretValue(value);
    } catch {
      return null;
    }
  }

  private asRecord(value: unknown) {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }
}
