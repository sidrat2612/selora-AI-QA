import { ExecutionSourceMode, MembershipRole, RolloutStage, type Prisma, type SuiteStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { GitHubIntegrationService } from '../github/github-integration.service';
import { TestRailIntegrationService } from '../testrail/testrail-integration.service';
import { ensureDefaultSuite, toSuiteSlug } from './suite-defaults';

const suiteSummarySelect = {
  id: true,
  tenantId: true,
  workspaceId: true,
  slug: true,
  name: true,
  description: true,
  status: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      canonicalTests: true,
    },
  },
} as const;

@Injectable()
export class SuitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly githubIntegrationService: GitHubIntegrationService,
    private readonly testRailIntegrationService: TestRailIntegrationService,
  ) {}

  async listSuites(workspaceId: string) {
    const suites = await this.prisma.automationSuite.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: suiteSummarySelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return Promise.all(suites.map((suite) => this.toSuiteSummary(suite)));
  }

  async getSuiteDetails(workspaceId: string, suiteId: string) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      include: {
        _count: {
          select: { canonicalTests: true },
        },
        githubIntegration: {
          select: {
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
          },
        },
        testRailIntegration: {
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
          },
        },
        canonicalTests: {
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
            externalCaseLink: {
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
            },
            generatedArtifacts: {
              select: {
                id: true,
                status: true,
                version: true,
                createdAt: true,
              },
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 12,
        },
      },
    });

    if (!suite) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }

    const generatedArtifactCount = await this.prisma.generatedTestArtifact.count({
      where: {
        canonicalTest: {
          suiteId: suite.id,
        },
      },
    });

    const latestActivityAt = suite.canonicalTests[0]?.updatedAt ?? suite.updatedAt;

    return {
      id: suite.id,
      tenantId: suite.tenantId,
      workspaceId: suite.workspaceId,
      slug: suite.slug,
      name: suite.name,
      description: suite.description,
      status: suite.status,
      isDefault: suite.isDefault,
      createdAt: suite.createdAt,
      updatedAt: suite.updatedAt,
      counts: {
        canonicalTests: suite._count.canonicalTests,
        generatedArtifacts: generatedArtifactCount,
      },
      latestActivityAt,
      screenshotPolicy: suite.screenshotPolicy,
      executionPolicy: {
        defaultMode: suite.executionSourcePolicy,
        allowBranchHeadExecution: suite.allowBranchHeadExecution,
        allowStorageExecutionFallback: suite.allowStorageExecutionFallback,
      },
      rollout: {
        stage: suite.rolloutStage,
        githubPublishingEnabled: suite.githubPublishingEnabled,
        gitExecutionEnabled: suite.gitExecutionEnabled,
        testRailSyncEnabled: suite.testRailSyncEnabled,
      },
      linkedSystems: {
        github: suite.githubIntegration
          ? this.githubIntegrationService.toIntegrationSummary(suite.githubIntegration)
          : null,
        testrail: suite.testRailIntegration
          ? this.testRailIntegrationService.toIntegrationSummary(suite.testRailIntegration)
          : null,
      },
      canonicalTests: suite.canonicalTests.map((test) => ({
        id: test.id,
        name: test.name,
        status: test.status,
        updatedAt: test.updatedAt,
        externalCaseLink: test.externalCaseLink,
        latestArtifact: test.generatedArtifacts[0] ?? null,
      })),
    };
  }

  async createSuite(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, tenantId: true },
    });

    if (!workspace || workspace.tenantId !== tenantId) {
      throw notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.');
    }

    const name = this.readNonEmptyString(body['name'], 'name');
    const slug = this.readSuiteSlug(body['slug'], name);
    const description = this.readOptionalString(body['description']);

    const existing = await this.prisma.automationSuite.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });

    if (existing) {
      throw conflict('SUITE_SLUG_EXISTS', 'Suite slug already exists for this workspace.');
    }

    const suite = await this.prisma.automationSuite.create({
      data: {
        tenantId,
        workspaceId,
        name,
        slug,
        description,
      },
      select: suiteSummarySelect,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'suite.created',
      entityType: 'automation_suite',
      entityId: suite.id,
      requestId,
      metadataJson: { slug: suite.slug, isDefault: suite.isDefault },
    });

    return this.toSuiteSummary(suite);
  }

  async updateSuite(
    workspaceId: string,
    suiteId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const existing = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        isDefault: true,
      },
    });

    if (!existing) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }

    const name = this.readOptionalString(body['name']);
    const description = body['description'] === null ? null : this.readOptionalString(body['description']);
    const status = this.readOptionalSuiteStatus(body['status']);
    const requestedSlug = this.readOptionalString(body['slug']);
    const slug = requestedSlug ? this.readSuiteSlug(requestedSlug, requestedSlug) : undefined;
    const executionSourcePolicy = body['executionSourcePolicy'] === undefined
      ? undefined
      : this.readExecutionSourceMode(body['executionSourcePolicy']);
    const allowBranchHeadExecution = body['allowBranchHeadExecution'] === undefined
      ? undefined
      : this.readBoolean(body['allowBranchHeadExecution'], 'allowBranchHeadExecution');
    const allowStorageExecutionFallback = body['allowStorageExecutionFallback'] === undefined
      ? undefined
      : this.readBoolean(body['allowStorageExecutionFallback'], 'allowStorageExecutionFallback');
    const rolloutStage = body['rolloutStage'] === undefined
      ? undefined
      : this.readRolloutStage(body['rolloutStage']);
    const githubPublishingEnabled = body['githubPublishingEnabled'] === undefined
      ? undefined
      : this.readBoolean(body['githubPublishingEnabled'], 'githubPublishingEnabled');
    const gitExecutionEnabled = body['gitExecutionEnabled'] === undefined
      ? undefined
      : this.readBoolean(body['gitExecutionEnabled'], 'gitExecutionEnabled');
    const testRailSyncEnabled = body['testRailSyncEnabled'] === undefined
      ? undefined
      : this.readBoolean(body['testRailSyncEnabled'], 'testRailSyncEnabled');

    if (existing.isDefault && status === 'ARCHIVED') {
      throw badRequest('SUITE_DEFAULT_ARCHIVE_FORBIDDEN', 'Default suite cannot be archived.');
    }

    if (slug && slug !== existing.slug) {
      const slugConflict = await this.prisma.automationSuite.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
        select: { id: true },
      });
      if (slugConflict && slugConflict.id !== suiteId) {
        throw conflict('SUITE_SLUG_EXISTS', 'Suite slug already exists for this workspace.');
      }
    }

    const updated = await this.prisma.automationSuite.update({
      where: { id: suiteId },
      data: {
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
        ...(body['description'] !== undefined ? { description } : {}),
        ...(status ? { status } : {}),
        ...(executionSourcePolicy ? { executionSourcePolicy } : {}),
        ...(allowBranchHeadExecution !== undefined ? { allowBranchHeadExecution } : {}),
        ...(allowStorageExecutionFallback !== undefined ? { allowStorageExecutionFallback } : {}),
        ...(rolloutStage ? { rolloutStage } : {}),
        ...(githubPublishingEnabled !== undefined ? { githubPublishingEnabled } : {}),
        ...(gitExecutionEnabled !== undefined ? { gitExecutionEnabled } : {}),
        ...(testRailSyncEnabled !== undefined ? { testRailSyncEnabled } : {}),
      },
      select: suiteSummarySelect,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: status === 'ARCHIVED' ? 'suite.archived' : 'suite.updated',
      entityType: 'automation_suite',
      entityId: suiteId,
      requestId,
      metadataJson: {
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        executionSourcePolicy: executionSourcePolicy ?? undefined,
        allowBranchHeadExecution: allowBranchHeadExecution ?? undefined,
        allowStorageExecutionFallback: allowStorageExecutionFallback ?? undefined,
        rolloutStage: rolloutStage ?? undefined,
        githubPublishingEnabled: githubPublishingEnabled ?? undefined,
        gitExecutionEnabled: gitExecutionEnabled ?? undefined,
        testRailSyncEnabled: testRailSyncEnabled ?? undefined,
      },
    });

    return this.getSuiteDetails(workspaceId, updated.id);
  }

  async deleteSuite(
    workspaceId: string,
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    return this.updateSuite(
      workspaceId,
      suiteId,
      { status: 'ARCHIVED' },
      auth,
      tenantId,
      requestId,
    );
  }

  async ensureWorkspaceDefaultSuite(workspaceId: string, tenantId: string, workspaceName?: string | null) {
    return this.prisma.$transaction((transaction) =>
      ensureDefaultSuite(transaction, {
        workspaceId,
        tenantId,
        workspaceName,
      }),
    );
  }

  private async toSuiteSummary(
    suite: Prisma.AutomationSuiteGetPayload<{ select: typeof suiteSummarySelect }>,
  ) {
    const generatedArtifactCount = await this.prisma.generatedTestArtifact.count({
      where: {
        canonicalTest: {
          suiteId: suite.id,
        },
      },
    });

    const latestActivity = await this.prisma.canonicalTest.findFirst({
      where: { suiteId: suite.id },
      select: { updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      id: suite.id,
      tenantId: suite.tenantId,
      workspaceId: suite.workspaceId,
      slug: suite.slug,
      name: suite.name,
      description: suite.description,
      status: suite.status,
      isDefault: suite.isDefault,
      counts: {
        canonicalTests: suite._count.canonicalTests,
        generatedArtifacts: generatedArtifactCount,
      },
      latestActivityAt: latestActivity?.updatedAt ?? suite.updatedAt,
      createdAt: suite.createdAt,
      updatedAt: suite.updatedAt,
    };
  }

  private readNonEmptyString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('SUITE_FIELD_REQUIRED', `${fieldName} is required.`);
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

  private readSuiteSlug(value: unknown, fallbackName: string) {
    const raw = typeof value === 'string' && value.trim().length > 0 ? value : fallbackName;
    const slug = toSuiteSlug(raw);
    if (!slug) {
      throw badRequest('SUITE_SLUG_INVALID', 'Suite slug is invalid.');
    }

    return slug;
  }

  private readOptionalSuiteStatus(value: unknown): SuiteStatus | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    if (value === 'ACTIVE' || value === 'ARCHIVED') {
      return value;
    }

    throw badRequest('SUITE_STATUS_INVALID', 'Suite status must be ACTIVE or ARCHIVED.');
  }

  private readExecutionSourceMode(value: unknown): ExecutionSourceMode {
    if (
      value === ExecutionSourceMode.STORAGE_ARTIFACT ||
      value === ExecutionSourceMode.PINNED_COMMIT ||
      value === ExecutionSourceMode.BRANCH_HEAD
    ) {
      return value;
    }

    throw badRequest(
      'SUITE_EXECUTION_SOURCE_POLICY_INVALID',
      'executionSourcePolicy must be STORAGE_ARTIFACT, PINNED_COMMIT, or BRANCH_HEAD.',
    );
  }

  private readBoolean(value: unknown, fieldName: string) {
    if (typeof value === 'boolean') {
      return value;
    }

    throw badRequest('SUITE_BOOLEAN_FIELD_INVALID', `${fieldName} must be a boolean value.`);
  }

  private readRolloutStage(value: unknown): RolloutStage {
    if (value === RolloutStage.INTERNAL || value === RolloutStage.PILOT || value === RolloutStage.GENERAL) {
      return value;
    }

    throw badRequest('SUITE_ROLLOUT_STAGE_INVALID', 'rolloutStage must be INTERNAL, PILOT, or GENERAL.');
  }

  async bulkAssignTests(
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

    const testIds = this.readStringArray(body['testIds'], 'testIds');
    if (testIds.length === 0) {
      throw badRequest('SUITE_ASSIGN_EMPTY', 'At least one test ID is required.');
    }
    if (testIds.length > 200) {
      throw badRequest('SUITE_ASSIGN_TOO_MANY', 'Cannot assign more than 200 tests at once.');
    }

    const tests = await this.prisma.canonicalTest.findMany({
      where: { id: { in: testIds }, workspaceId },
      select: { id: true, suiteId: true },
    });

    const found = new Set(tests.map((t) => t.id));
    const missing = testIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw badRequest('SUITE_ASSIGN_TESTS_NOT_FOUND', `Tests not found: ${missing.slice(0, 5).join(', ')}`);
    }

    const updated = await this.prisma.canonicalTest.updateMany({
      where: { id: { in: testIds }, workspaceId },
      data: { suiteId },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'suite.tests_assigned',
      entityType: 'automation_suite',
      entityId: suiteId,
      requestId,
      metadataJson: { testIds, assignedCount: updated.count },
    });

    return { assignedCount: updated.count };
  }

  async bulkUnassignTests(
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

    const testIds = this.readStringArray(body['testIds'], 'testIds');
    if (testIds.length === 0) {
      throw badRequest('SUITE_UNASSIGN_EMPTY', 'At least one test ID is required.');
    }

    const updated = await this.prisma.canonicalTest.updateMany({
      where: { id: { in: testIds }, workspaceId, suiteId },
      data: { suiteId: null },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'suite.tests_unassigned',
      entityType: 'automation_suite',
      entityId: suiteId,
      requestId,
      metadataJson: { testIds, unassignedCount: updated.count },
    });

    return { unassignedCount: updated.count };
  }

  private readStringArray(value: unknown, fieldName: string): string[] {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.trim().length > 0)) {
      throw badRequest('SUITE_FIELD_INVALID', `${fieldName} must be an array of non-empty strings.`);
    }
    return value.map((v: string) => v.trim());
  }
}