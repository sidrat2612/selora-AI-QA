import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RepositoryAllowlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.gitHubRepositoryAllowlistEntry.findMany({
      where: { workspaceId },
      select: {
        id: true,
        repoOwner: true,
        repoName: true,
        approvedAt: true,
        approvedByUser: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { approvedAt: 'desc' },
    });
  }

  async add(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const repoOwner = this.readNonEmpty(body['repoOwner'], 'repoOwner');
    const repoName = this.readNonEmpty(body['repoName'], 'repoName');

    const existing = await this.prisma.gitHubRepositoryAllowlistEntry.findUnique({
      where: { workspaceId_repoOwner_repoName: { workspaceId, repoOwner, repoName } },
      select: { id: true },
    });

    if (existing) {
      throw conflict('REPO_ALREADY_ALLOWLISTED', `${repoOwner}/${repoName} is already in the allowlist.`);
    }

    const entry = await this.prisma.gitHubRepositoryAllowlistEntry.create({
      data: {
        tenantId,
        workspaceId,
        repoOwner,
        repoName,
        approvedByUserId: auth.user.id,
      },
      select: {
        id: true,
        repoOwner: true,
        repoName: true,
        approvedAt: true,
        approvedByUser: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'repository_allowlist.added',
      entityType: 'github_repository_allowlist',
      entityId: entry.id,
      requestId,
      metadataJson: { repoOwner, repoName },
    });

    return entry;
  }

  async remove(
    workspaceId: string,
    entryId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const entry = await this.prisma.gitHubRepositoryAllowlistEntry.findFirst({
      where: { id: entryId, workspaceId },
      select: { id: true, tenantId: true, repoOwner: true, repoName: true },
    });

    if (!entry || entry.tenantId !== tenantId) {
      throw notFound('REPO_ALLOWLIST_ENTRY_NOT_FOUND', 'Allowlist entry was not found.');
    }

    await this.prisma.gitHubRepositoryAllowlistEntry.delete({
      where: { id: entryId },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'repository_allowlist.removed',
      entityType: 'github_repository_allowlist',
      entityId: entryId,
      requestId,
      metadataJson: { repoOwner: entry.repoOwner, repoName: entry.repoName },
    });

    return { removed: true };
  }

  async isAllowed(workspaceId: string, repoOwner: string, repoName: string): Promise<boolean> {
    const count = await this.prisma.gitHubRepositoryAllowlistEntry.count({
      where: { workspaceId, repoOwner, repoName },
    });
    return count > 0;
  }

  private readNonEmpty(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('REPO_FIELD_REQUIRED', `${fieldName} is required.`);
    }
    return value.trim();
  }
}
