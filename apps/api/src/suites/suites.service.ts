import { MembershipRole, type Prisma, type SuiteStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { GitHubIntegrationService } from '../github/github-integration.service';
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
        canonicalTests: {
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
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
      linkedSystems: {
        github: suite.githubIntegration
          ? this.githubIntegrationService.toIntegrationSummary(suite.githubIntegration)
          : null,
        testrail: null,
      },
      canonicalTests: suite.canonicalTests.map((test) => ({
        id: test.id,
        name: test.name,
        status: test.status,
        updatedAt: test.updatedAt,
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
      },
    });

    return this.toSuiteSummary(updated);
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
}