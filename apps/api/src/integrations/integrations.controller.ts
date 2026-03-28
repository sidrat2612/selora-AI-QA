import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { CITemplateService } from './ci-template.service';

@Controller('workspaces/:workspaceId/integrations')
@UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
export class IntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ciTemplateService: CITemplateService,
  ) {}

  @Get()
  async listIntegrations(
    @Param('workspaceId') workspaceId: string,
    @Req() request: AppRequest,
  ) {
    const suites = await this.prisma.automationSuite.findMany({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        githubIntegration: {
          select: {
            id: true,
            status: true,
            repoOwner: true,
            repoName: true,
            defaultBranch: true,
            allowedWriteScope: true,
            lastValidatedAt: true,
            secretRotatedAt: true,
            credentialMode: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        testRailIntegration: {
          select: {
            id: true,
            status: true,
            baseUrl: true,
            projectId: true,
            suiteIdExternal: true,
            syncPolicy: true,
            lastValidatedAt: true,
            lastSyncedAt: true,
            createdAt: true,
            updatedAt: true,
            syncRuns: {
              select: {
                id: true,
                status: true,
                totalCount: true,
                syncedCount: true,
                failedCount: true,
                startedAt: true,
                finishedAt: true,
              },
              orderBy: { startedAt: 'desc' as const },
              take: 1,
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const items = suites.map((suite) => ({
      suiteId: suite.id,
      suiteName: suite.name,
      suiteSlug: suite.slug,
      suiteStatus: suite.status,
      github: suite.githubIntegration
        ? {
            id: suite.githubIntegration.id,
            status: suite.githubIntegration.status,
            repoOwner: suite.githubIntegration.repoOwner,
            repoName: suite.githubIntegration.repoName,
            defaultBranch: suite.githubIntegration.defaultBranch,
            allowedWriteScope: suite.githubIntegration.allowedWriteScope,
            credentialMode: suite.githubIntegration.credentialMode,
            lastValidatedAt: suite.githubIntegration.lastValidatedAt,
            secretRotatedAt: suite.githubIntegration.secretRotatedAt,
            createdAt: suite.githubIntegration.createdAt,
            updatedAt: suite.githubIntegration.updatedAt,
          }
        : null,
      testrail: suite.testRailIntegration
        ? {
            id: suite.testRailIntegration.id,
            status: suite.testRailIntegration.status,
            baseUrl: suite.testRailIntegration.baseUrl,
            projectId: suite.testRailIntegration.projectId,
            suiteIdExternal: suite.testRailIntegration.suiteIdExternal,
            syncPolicy: suite.testRailIntegration.syncPolicy,
            lastValidatedAt: suite.testRailIntegration.lastValidatedAt,
            lastSyncedAt: suite.testRailIntegration.lastSyncedAt,
            latestSync: suite.testRailIntegration.syncRuns[0] ?? null,
            createdAt: suite.testRailIntegration.createdAt,
            updatedAt: suite.testRailIntegration.updatedAt,
          }
        : null,
    }));

    return success(items, { requestId: request.requestId });
  }

  @Post('ci-template/generate')
  async generateCITemplate(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    const result = this.ciTemplateService.generate(body, workspaceId);
    return success(result, { requestId: request.requestId });
  }
}
