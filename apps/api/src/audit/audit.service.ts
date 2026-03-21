import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { badRequest } from '../common/http-errors';

type AuditInput = {
  tenantId: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    await this.prisma.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId ?? null,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId ?? null,
        metadataJson: input.metadataJson
          ? (input.metadataJson as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async listEvents(workspaceId: string, query: Record<string, string | undefined>) {
    const page = this.readPositiveInt(query['page'], 1);
    const pageSize = Math.min(this.readPositiveInt(query['pageSize'], 20), 100);
    const eventType = query['eventType']?.trim() || undefined;
    const entityType = query['entityType']?.trim() || undefined;
    const actorUserId = query['actorUserId']?.trim() || undefined;
    const startDate = this.readDate(query['startDate']);
    const endDate = this.readDate(query['endDate']);

    const where: Prisma.AuditEventWhereInput = {
      workspaceId,
      ...(eventType ? { eventType } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...((startDate || endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actor: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalCount,
      hasMore: page * pageSize < totalCount,
    };
  }

  async getDistinctEventTypes(workspaceId: string) {
    const results = await this.prisma.auditEvent.findMany({
      where: { workspaceId },
      distinct: ['eventType'],
      select: { eventType: true },
      orderBy: { eventType: 'asc' },
    });

    return results.map((row) => row.eventType);
  }

  private readPositiveInt(value: string | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw badRequest('PAGINATION_INVALID', 'Pagination values must be positive integers.');
    }

    return parsed;
  }

  private readDate(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      throw badRequest('AUDIT_DATE_INVALID', 'Date filters must be valid ISO timestamps or dates.');
    }

    return parsed;
  }
}