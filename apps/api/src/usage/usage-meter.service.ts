import { Injectable } from '@nestjs/common';
import { MetricType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { badRequest } from '../common/http-errors';

@Injectable()
export class UsageMeterService {
  constructor(private readonly prisma: PrismaService) {}

  async recordMetric(input: {
    tenantId: string;
    workspaceId?: string | null;
    metricType: MetricType;
    value: number;
    unit: string;
    windowStart?: Date;
    windowEnd?: Date;
  }) {
    const now = new Date();
    const windowStart = input.windowStart ?? startOfDay(now);
    const windowEnd = input.windowEnd ?? endOfDay(now);

    await this.prisma.usageMeter.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId ?? null,
        metricType: input.metricType,
        metricWindowStart: windowStart,
        metricWindowEnd: windowEnd,
        value: input.value,
        unit: input.unit,
      },
    });
  }

  async getWorkspaceUsage(workspaceId: string, query: Record<string, string | undefined>) {
    const { since, until } = this.readDateRange(query);

    const results = await this.prisma.usageMeter.groupBy({
      by: ['metricType', 'unit'],
      where: {
        workspaceId,
        metricWindowStart: { gte: since },
        metricWindowEnd: { lte: until },
      },
      _sum: { value: true },
      _count: true,
    });

    return {
      workspaceId,
      periodStart: since.toISOString(),
      periodEnd: until.toISOString(),
      metrics: results.map((row) => ({
        metricType: row.metricType,
        unit: row.unit,
        total: row._sum.value ?? 0,
        records: row._count,
      })),
    };
  }

  async getTenantUsage(tenantId: string, query: Record<string, string | undefined>) {
    const { since, until } = this.readDateRange(query);

    const results = await this.prisma.usageMeter.groupBy({
      by: ['metricType', 'unit'],
      where: {
        tenantId,
        metricWindowStart: { gte: since },
        metricWindowEnd: { lte: until },
      },
      _sum: { value: true },
      _count: true,
    });

    return {
      tenantId,
      periodStart: since.toISOString(),
      periodEnd: until.toISOString(),
      metrics: results.map((row) => ({
        metricType: row.metricType,
        unit: row.unit,
        total: row._sum.value ?? 0,
        records: row._count,
      })),
    };
  }

  private readDateRange(query: Record<string, string | undefined>) {
    const now = new Date();
    const sinceRaw = query['since']?.trim();
    const untilRaw = query['until']?.trim();

    let since: Date;
    if (sinceRaw) {
      since = new Date(sinceRaw);
      if (Number.isNaN(since.valueOf())) {
        throw badRequest('USAGE_DATE_INVALID', 'since must be a valid ISO date.');
      }
    } else {
      since = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    let until: Date;
    if (untilRaw) {
      until = new Date(untilRaw);
      if (Number.isNaN(until.valueOf())) {
        throw badRequest('USAGE_DATE_INVALID', 'until must be a valid ISO date.');
      }
    } else {
      until = now;
    }

    return { since, until };
  }
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
