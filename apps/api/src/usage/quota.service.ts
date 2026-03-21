import { Injectable } from '@nestjs/common';
import { MembershipStatus, MetricType, RunStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { badRequest } from '../common/http-errors';
import { PrismaService } from '../database/prisma.service';
import { RequestRateLimitService } from '../rate-limits/request-rate-limit.service';

type QuotaMetricSummary = {
  metricType: MetricType;
  label: string;
  unit: string;
  usage: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  threshold: 'normal' | 'warning' | 'critical' | 'exceeded' | 'unlimited';
};

const METRIC_CONFIG: Record<MetricType, { label: string; unit: string }> = {
  RUN_COUNT: { label: 'Runs created', unit: 'runs' },
  EXECUTION_MINUTES: { label: 'Execution minutes', unit: 'minutes' },
  ARTIFACT_STORAGE_BYTES: { label: 'Stored artifacts', unit: 'bytes' },
  CONCURRENT_EXECUTIONS: { label: 'Concurrent executions', unit: 'runs' },
  AI_REPAIR_ATTEMPTS: { label: 'AI repair attempts', unit: 'attempts' },
  API_REQUESTS_PER_MINUTE: { label: 'API requests per minute', unit: 'requests/min' },
  USER_SEATS: { label: 'User seats', unit: 'seats' },
  WORKSPACE_COUNT: { label: 'Workspaces', unit: 'workspaces' },
};

const ACTIVE_RUN_STATUSES: RunStatus[] = ['QUEUED', 'RUNNING'];

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly requestRateLimitService: RequestRateLimitService,
  ) {}

  async getTenantQuotaOverview(tenantId: string) {
    const [limits, usage] = await Promise.all([
      this.getLimitMap(tenantId),
      this.getUsageMap(tenantId),
    ]);

    const metrics = (Object.keys(METRIC_CONFIG) as MetricType[]).map((metricType) => {
      const config = METRIC_CONFIG[metricType];
      const currentUsage = usage.get(metricType) ?? 0;
      const limit = limits.get(metricType) ?? null;
      const remaining = limit === null ? null : Math.max(limit - currentUsage, 0);
      const percentUsed = limit === null || limit <= 0 ? null : Number(((currentUsage / limit) * 100).toFixed(1));

      let threshold: QuotaMetricSummary['threshold'] = 'unlimited';
      if (limit !== null) {
        if (currentUsage > limit) {
          threshold = 'exceeded';
        } else if (percentUsed !== null && percentUsed >= 90) {
          threshold = 'critical';
        } else if (percentUsed !== null && percentUsed >= 80) {
          threshold = 'warning';
        } else {
          threshold = 'normal';
        }
      }

      return {
        metricType,
        label: config.label,
        unit: config.unit,
        usage: currentUsage,
        limit,
        remaining,
        percentUsed,
        threshold,
      } satisfies QuotaMetricSummary;
    });

    return {
      tenantId,
      metrics,
    };
  }

  async updateTenantQuotas(
    tenantId: string,
    body: Record<string, unknown>,
    actorUserId: string,
    requestId: string,
  ) {
    const limits = this.readLimits(body);

    await this.prisma.$transaction(async (transaction) => {
      for (const [metricType, limitValue] of limits.entries()) {
        if (limitValue === null) {
          await transaction.tenantQuota.deleteMany({ where: { tenantId, metricType } });
          continue;
        }

        await transaction.tenantQuota.upsert({
          where: { tenantId_metricType: { tenantId, metricType } },
          update: { limitValue },
          create: {
            tenantId,
            metricType,
            limitValue,
          },
        });
      }
    });

    await this.auditService.record({
      tenantId,
      workspaceId: null,
      actorUserId,
      eventType: 'tenant.quotas_updated',
      entityType: 'tenant_quota',
      entityId: tenantId,
      requestId,
      metadataJson: {
        limits: Object.fromEntries(limits.entries()),
      },
    });

    return this.getTenantQuotaOverview(tenantId);
  }

  async assertRunCreationAllowed(tenantId: string) {
    const [runCountLimit, concurrentLimit, runCount, activeRunCount] = await Promise.all([
      this.getLimitValue(tenantId, 'RUN_COUNT'),
      this.getLimitValue(tenantId, 'CONCURRENT_EXECUTIONS'),
      this.prisma.testRun.count({ where: { tenantId } }),
      this.prisma.testRun.count({
        where: {
          tenantId,
          status: { in: ACTIVE_RUN_STATUSES },
        },
      }),
    ]);

    if (runCountLimit !== null && runCount + 1 > runCountLimit) {
      this.throwQuotaExceeded('RUN_COUNT', runCountLimit, runCount, 1);
    }

    if (concurrentLimit !== null && activeRunCount + 1 > concurrentLimit) {
      this.throwQuotaExceeded('CONCURRENT_EXECUTIONS', concurrentLimit, activeRunCount, 1);
    }
  }

  async assertRecordingUploadAllowed(tenantId: string, requestedBytes: number) {
    const limit = await this.getLimitValue(tenantId, 'ARTIFACT_STORAGE_BYTES');
    if (limit === null) {
      return;
    }

    const usage = await this.getArtifactStorageBytes(tenantId);
    if (usage + requestedBytes > limit) {
      this.throwQuotaExceeded('ARTIFACT_STORAGE_BYTES', limit, usage, requestedBytes);
    }
  }

  async assertSeatAvailable(tenantId: string, userId: string) {
    const limit = await this.getLimitValue(tenantId, 'USER_SEATS');
    if (limit === null) {
      return;
    }

    const existingSeat = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
      },
      select: { id: true },
    });

    if (existingSeat) {
      return;
    }

    const usage = await this.getUserSeatCount(tenantId);
    if (usage + 1 > limit) {
      this.throwQuotaExceeded('USER_SEATS', limit, usage, 1);
    }
  }

  private async getLimitMap(tenantId: string) {
    const quotas = await this.prisma.tenantQuota.findMany({
      where: { tenantId },
      select: { metricType: true, limitValue: true },
    });

    return new Map(quotas.map((quota) => [quota.metricType, quota.limitValue]));
  }

  private async getLimitValue(tenantId: string, metricType: MetricType) {
    const quota = await this.prisma.tenantQuota.findUnique({
      where: { tenantId_metricType: { tenantId, metricType } },
      select: { limitValue: true },
    });

    return quota?.limitValue ?? null;
  }

  private async getUsageMap(tenantId: string) {
    const [runCount, executionMinutes, artifactStorageBytes, concurrentExecutions, repairAttempts, apiRequestsPerMinute, seatCount, workspaceCount] = await Promise.all([
      this.prisma.testRun.count({ where: { tenantId } }),
      this.prisma.usageMeter.aggregate({
        where: { tenantId, metricType: 'EXECUTION_MINUTES' },
        _sum: { value: true },
      }),
      this.getArtifactStorageBytes(tenantId),
      this.prisma.testRun.count({
        where: {
          tenantId,
          status: { in: ACTIVE_RUN_STATUSES },
        },
      }),
      this.prisma.aIRepairAttempt.count({ where: { workspace: { tenantId } } }),
      this.requestRateLimitService.getTenantRequestUsage(tenantId),
      this.getUserSeatCount(tenantId),
      this.prisma.workspace.count({ where: { tenantId } }),
    ]);

    return new Map<MetricType, number>([
      ['RUN_COUNT', runCount],
      ['EXECUTION_MINUTES', executionMinutes._sum.value ?? 0],
      ['ARTIFACT_STORAGE_BYTES', artifactStorageBytes],
      ['CONCURRENT_EXECUTIONS', concurrentExecutions],
      ['AI_REPAIR_ATTEMPTS', repairAttempts],
      ['API_REQUESTS_PER_MINUTE', apiRequestsPerMinute],
      ['USER_SEATS', seatCount],
      ['WORKSPACE_COUNT', workspaceCount],
    ]);
  }

  private async getArtifactStorageBytes(tenantId: string) {
    const [artifacts, recordings] = await Promise.all([
      this.prisma.artifact.aggregate({
        where: { workspace: { tenantId } },
        _sum: { sizeBytes: true },
      }),
      this.prisma.recordingAsset.findMany({
        where: { workspace: { tenantId } },
        select: { metadataJson: true },
      }),
    ]);

    const recordingBytes = recordings.reduce((total, recording) => {
      if (!recording.metadataJson || typeof recording.metadataJson !== 'object' || Array.isArray(recording.metadataJson)) {
        return total;
      }

      const rawSize = (recording.metadataJson as Record<string, unknown>)['fileSizeBytes'];
      return typeof rawSize === 'number' && Number.isFinite(rawSize) ? total + rawSize : total;
    }, 0);

    return Number(artifacts._sum.sizeBytes ?? 0n) + recordingBytes;
  }

  private async getUserSeatCount(tenantId: string) {
    const seats = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return seats.length;
  }

  private readLimits(body: Record<string, unknown>) {
    const rawLimits = body['limits'];
    if (!rawLimits || typeof rawLimits !== 'object' || Array.isArray(rawLimits)) {
      throw badRequest('QUOTA_LIMITS_INVALID', 'limits must be an object keyed by metric type.');
    }

    const limits = new Map<MetricType, number | null>();
    for (const [key, value] of Object.entries(rawLimits)) {
      if (!(key in METRIC_CONFIG)) {
        throw badRequest('QUOTA_METRIC_INVALID', `Unsupported quota metric: ${key}.`);
      }

      if (value === null || value === '') {
        limits.set(key as MetricType, null);
        continue;
      }

      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw badRequest('QUOTA_LIMIT_INVALID', `${key} must be a non-negative number or null.`);
      }

      limits.set(key as MetricType, value);
    }

    if (limits.size === 0) {
      throw badRequest('QUOTA_LIMITS_INVALID', 'Provide at least one quota limit to update.');
    }

    return limits;
  }

  private throwQuotaExceeded(metricType: MetricType, limit: number, usage: number, requested: number) {
    const config = METRIC_CONFIG[metricType];
    throw badRequest(
      'QUOTA_EXCEEDED',
      `${config.label} quota exceeded. Current usage is ${usage} ${config.unit}, the limit is ${limit} ${config.unit}, and the requested change is ${requested} ${config.unit}.`,
      {
        metricType,
        limit,
        currentUsage: usage,
        requested,
      },
    );
  }
}