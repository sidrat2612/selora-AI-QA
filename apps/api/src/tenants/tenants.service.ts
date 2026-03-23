import { Injectable } from '@nestjs/common';
import { MembershipRole, TenantStatus, type Prisma } from '@prisma/client';
import { badRequest, conflict, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

type TenantLifecycleUpdateInput = {
  status?: unknown;
  softDeleteAction?: unknown;
  softDeleteGraceDays?: unknown;
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getTenantLifecycle(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        workspaces: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!tenant) {
      throw notFound('TENANT_NOT_FOUND', 'Tenant was not found.');
    }

    const tenantWorkspaceIds = tenant.workspaces.map((workspace) => workspace.id);
    const [memberships, runCount, recordingCount, generatedArtifactCount, auditEventCount] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.testRun.count({ where: { tenantId } }),
      this.prisma.recordingAsset.count({ where: { workspace: { tenantId } } }),
      this.prisma.generatedTestArtifact.count({ where: { workspace: { tenantId } } }),
      this.prisma.auditEvent.count({ where: { tenantId } }),
    ]);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      createdAt: tenant.createdAt,
      suspendedAt: tenant.suspendedAt,
      archivedAt: tenant.archivedAt,
      softDeleteRequestedAt: tenant.softDeleteRequestedAt,
      softDeleteScheduledFor: tenant.softDeleteScheduledFor,
      counts: {
        workspaces: tenant.workspaces.length,
        activeWorkspaces: tenant.workspaces.filter((workspace) => workspace.status === 'ACTIVE').length,
        memberSeats: memberships.length,
        runs: runCount,
        recordings: recordingCount,
        generatedArtifacts: generatedArtifactCount,
        auditEvents: auditEventCount,
      },
      workspaces: tenant.workspaces,
      scopedWorkspaceIds: tenantWorkspaceIds,
    };
  }

  async updateTenantLifecycle(
    tenantId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    requestId: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw notFound('TENANT_NOT_FOUND', 'Tenant was not found.');
    }

    const input = body as TenantLifecycleUpdateInput;
    const hasStatus = input.status !== undefined;
    const hasSoftDeleteAction = input.softDeleteAction !== undefined;

    if (!hasStatus && !hasSoftDeleteAction) {
      throw badRequest(
        'TENANT_LIFECYCLE_UPDATE_INVALID',
        'Provide either a tenant status update or a soft-delete action.',
      );
    }

    if (hasStatus && hasSoftDeleteAction) {
      throw badRequest(
        'TENANT_LIFECYCLE_UPDATE_INVALID',
        'Status updates and soft-delete actions must be sent separately.',
      );
    }

    const now = new Date();

    if (hasSoftDeleteAction) {
      const action = this.readSoftDeleteAction(input.softDeleteAction);

      if (action === 'REQUEST') {
        const graceDays = this.readSoftDeleteGraceDays(input.softDeleteGraceDays);
        const scheduledFor = new Date(now.getTime() + graceDays * 86_400_000);

        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            status: TenantStatus.ARCHIVED,
            archivedAt: tenant.archivedAt ?? now,
            suspendedAt: null,
            softDeleteRequestedAt: now,
            softDeleteScheduledFor: scheduledFor,
          },
        });

        await this.auditService.record({
          tenantId,
          actorUserId: auth.user.id,
          eventType: 'tenant.soft_delete_requested',
          entityType: 'tenant',
          entityId: tenantId,
          requestId,
          metadataJson: {
            graceDays,
            scheduledFor: scheduledFor.toISOString(),
          },
        });
      } else {
        if (!tenant.softDeleteRequestedAt) {
          throw conflict('TENANT_SOFT_DELETE_NOT_PENDING', 'Tenant soft-delete is not currently pending.');
        }

        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            status: TenantStatus.ACTIVE,
            suspendedAt: null,
            archivedAt: null,
            softDeleteRequestedAt: null,
            softDeleteScheduledFor: null,
          },
        });

        await this.auditService.record({
          tenantId,
          actorUserId: auth.user.id,
          eventType: 'tenant.soft_delete_canceled',
          entityType: 'tenant',
          entityId: tenantId,
          requestId,
        });
      }

      return this.getTenantLifecycle(tenantId);
    }

    const nextStatus = this.readTenantStatus(input.status);
    const updateData: Prisma.TenantUpdateInput =
      nextStatus === TenantStatus.ACTIVE
        ? {
            status: TenantStatus.ACTIVE,
            suspendedAt: null,
            archivedAt: null,
            softDeleteRequestedAt: null,
            softDeleteScheduledFor: null,
          }
        : nextStatus === TenantStatus.SUSPENDED
          ? {
              status: TenantStatus.SUSPENDED,
              suspendedAt: now,
              archivedAt: null,
              softDeleteRequestedAt: null,
              softDeleteScheduledFor: null,
            }
          : {
              status: TenantStatus.ARCHIVED,
              suspendedAt: null,
              archivedAt: now,
              softDeleteRequestedAt: null,
              softDeleteScheduledFor: null,
            };

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    await this.auditService.record({
      tenantId,
      actorUserId: auth.user.id,
      eventType: 'tenant.status_updated',
      entityType: 'tenant',
      entityId: tenantId,
      requestId,
      metadataJson: {
        previousStatus: tenant.status,
        nextStatus,
      },
    });

    return this.getTenantLifecycle(tenantId);
  }

  async buildTenantExport(
    tenantId: string,
    query: Record<string, string | undefined>,
    auth: RequestAuthContext,
    requestId: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw notFound('TENANT_NOT_FOUND', 'Tenant was not found.');
    }

    const workspaceId = this.readOptionalWorkspaceId(query['workspaceId']);
    if (workspaceId) {
      const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, tenantId } });
      if (!workspace) {
        throw notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found for this tenant.');
      }
    }

    const workspaceWhere = workspaceId ? { id: workspaceId, tenantId } : { tenantId };
    const workspaceIds = (
      await this.prisma.workspace.findMany({
        where: workspaceWhere,
        select: { id: true },
      })
    ).map((workspace) => workspace.id);

    const [
      workspaces,
      memberships,
      quotas,
      usageMeters,
      environments,
      retentionSettings,
      recordings,
      canonicalTests,
      generatedArtifacts,
      testRuns,
      testRunItems,
      artifacts,
      repairAttempts,
      feedback,
      auditEvents,
    ] = await Promise.all([
      this.prisma.workspace.findMany({ where: workspaceWhere, orderBy: { createdAt: 'asc' } }),
      this.prisma.membership.findMany({
        where: workspaceId ? { tenantId, workspaceId } : { tenantId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tenantQuota.findMany({ where: { tenantId }, orderBy: { metricType: 'asc' } }),
      this.prisma.usageMeter.findMany({
        where: workspaceId ? { tenantId, workspaceId } : { tenantId },
        orderBy: [{ metricWindowStart: 'asc' }, { metricWindowEnd: 'asc' }],
      }),
      this.prisma.environment.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.retentionSetting.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.recordingAsset.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.canonicalTest.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.generatedTestArtifact.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: [{ canonicalTestId: 'asc' }, { version: 'asc' }],
      }),
      this.prisma.testRun.findMany({
        where: workspaceId ? { tenantId, workspaceId } : { tenantId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.testRunItem.findMany({
        where: { testRun: workspaceId ? { tenantId, workspaceId } : { tenantId } },
        orderBy: [{ testRunId: 'asc' }, { sequence: 'asc' }],
      }),
      this.prisma.artifact.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.aIRepairAttempt.findMany({
        where: { workspaceId: { in: workspaceIds } },
        orderBy: [{ canonicalTestId: 'asc' }, { attemptNumber: 'asc' }],
      }),
      this.prisma.betaFeedback.findMany({
        where: workspaceId ? { tenantId, workspaceId } : { tenantId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.auditEvent.findMany({
        where: workspaceId ? { tenantId, workspaceId } : { tenantId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const userIds = [...new Set(memberships.map((membership) => membership.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        passwordVersion: true,
        emailVerifiedAt: true,
        resetRequestedAt: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: auth.user.id,
      eventType: 'tenant.export_requested',
      entityType: 'tenant_export',
      entityId: workspaceId ?? tenantId,
      requestId,
      metadataJson: {
        scope: workspaceId ? 'workspace' : 'tenant',
        workspaceId: workspaceId ?? null,
      },
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedByUserId: auth.user.id,
      scope: workspaceId ? 'workspace' : 'tenant',
      tenant,
      users,
      memberships,
      workspaces,
      quotas,
      usageMeters,
      environments: environments.map(({ encryptedSecretJson, ...environment }) => environment),
      retentionSettings,
      recordings,
      canonicalTests,
      generatedArtifacts,
      testRuns,
      testRunItems,
      artifacts,
      repairAttempts,
      feedback,
      auditEvents,
    };

    const serialized = JSON.stringify(
      payload,
      (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
      2,
    );

    return {
      fileName: workspaceId ? `tenant-${tenant.slug}-workspace-${workspaceId}-export.json` : `tenant-${tenant.slug}-export.json`,
      contentType: 'application/json; charset=utf-8',
      buffer: Buffer.from(serialized, 'utf8'),
    };
  }

  private readTenantStatus(value: unknown) {
    if (value === TenantStatus.ACTIVE || value === TenantStatus.SUSPENDED || value === TenantStatus.ARCHIVED) {
      return value;
    }

    throw badRequest('TENANT_STATUS_INVALID', 'Tenant status must be ACTIVE, SUSPENDED, or ARCHIVED.');
  }

  private readSoftDeleteAction(value: unknown) {
    if (value === 'REQUEST' || value === 'CANCEL') {
      return value;
    }

    throw badRequest('TENANT_SOFT_DELETE_ACTION_INVALID', 'Soft-delete action must be REQUEST or CANCEL.');
  }

  private readSoftDeleteGraceDays(value: unknown) {
    const fallback = 30;
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) {
      throw badRequest('TENANT_SOFT_DELETE_GRACE_INVALID', 'softDeleteGraceDays must be between 1 and 90 days.');
    }

    return parsed;
  }

  private readOptionalWorkspaceId(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    return value.trim();
  }
}