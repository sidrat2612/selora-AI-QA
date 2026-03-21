import { Injectable } from '@nestjs/common';
import { FeedbackCategory, FeedbackPriority, FeedbackStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { badRequest, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listFeedback(workspaceId: string, query: Record<string, string | undefined>) {
    const status = this.readOptionalStatus(query['status']);
    const category = this.readOptionalCategory(query['category']);

    return this.prisma.betaFeedback.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      },
      include: {
        submittedBy: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createFeedback(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const title = this.readRequiredString(body['title'], 'title');
    const summary = this.readRequiredString(body['summary'], 'summary');
    const category = this.readOptionalCategory(body['category']) ?? FeedbackCategory.OTHER;

    const created = await this.prisma.betaFeedback.create({
      data: {
        tenantId,
        workspaceId,
        submittedByUserId: auth.user.id,
        title,
        summary,
        category,
        priority: FeedbackPriority.MEDIUM,
        status: FeedbackStatus.SUBMITTED,
      },
      include: {
        submittedBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'beta_feedback.created',
      entityType: 'beta_feedback',
      entityId: created.id,
      requestId,
      metadataJson: {
        category: created.category,
        priority: created.priority,
        status: created.status,
      },
    });

    return created;
  }

  async updateFeedback(
    workspaceId: string,
    feedbackId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const existing = await this.prisma.betaFeedback.findFirst({
      where: { id: feedbackId, workspaceId },
    });

    if (!existing) {
      throw notFound('FEEDBACK_NOT_FOUND', 'Feedback item was not found.');
    }

    const priority = this.readOptionalPriority(body['priority']);
    const status = this.readOptionalStatus(body['status']);
    const category = this.readOptionalCategory(body['category']);

    if (!priority && !status && !category) {
      throw badRequest('FEEDBACK_UPDATE_INVALID', 'Provide at least one mutable feedback field.');
    }

    const updated = await this.prisma.betaFeedback.update({
      where: { id: feedbackId },
      data: {
        ...(priority ? { priority } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      },
      include: {
        submittedBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'beta_feedback.updated',
      entityType: 'beta_feedback',
      entityId: updated.id,
      requestId,
      metadataJson: {
        category: updated.category,
        priority: updated.priority,
        status: updated.status,
      },
    });

    return updated;
  }

  private readRequiredString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.trim().length < 3) {
      throw badRequest('FEEDBACK_VALIDATION_ERROR', `${fieldName} must be at least 3 characters.`);
    }

    return value.trim();
  }

  private readOptionalCategory(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    if (!(value in FeedbackCategory)) {
      throw badRequest('FEEDBACK_CATEGORY_INVALID', 'Feedback category is invalid.');
    }

    return FeedbackCategory[value as keyof typeof FeedbackCategory];
  }

  private readOptionalPriority(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    if (!(value in FeedbackPriority)) {
      throw badRequest('FEEDBACK_PRIORITY_INVALID', 'Feedback priority is invalid.');
    }

    return FeedbackPriority[value as keyof typeof FeedbackPriority];
  }

  private readOptionalStatus(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    if (!(value in FeedbackStatus)) {
      throw badRequest('FEEDBACK_STATUS_INVALID', 'Feedback status is invalid.');
    }

    return FeedbackStatus[value as keyof typeof FeedbackStatus];
  }
}