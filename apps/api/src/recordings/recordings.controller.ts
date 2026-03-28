import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembershipRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { GitHubPublicationService } from '../github/github-publication.service';
import { success } from '../common/response';
import { badRequest } from '../common/http-errors';
import type { AppRequest } from '../common/types';
import { LicenseGuard } from '../licensing/license.guard';
import { RequireLicense } from '../licensing/require-license.decorator';
import { RecordingsService } from './recordings.service';
import { NLTestAuthoringService } from './nl-test-authoring.service';
import { TestHealthService } from './test-health.service';
import { AIRepairQueueService } from './ai-repair.queue';
import { PrismaService } from '../database/prisma.service';

type UploadedSourceFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const ALLOWED_UPLOAD_MIMETYPES = new Set([
  'text/plain',
  'application/json',
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'application/octet-stream',
]);

@Controller('workspaces/:workspaceId')
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly githubPublicationService: GitHubPublicationService,
    private readonly nlTestAuthoringService: NLTestAuthoringService,
    private readonly testHealthService: TestHealthService,
    private readonly aiRepairQueue: AIRepairQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('recordings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listRecordings(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.listRecordings(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('recordings/:recordingId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getRecording(
    @Param('workspaceId') workspaceId: string,
    @Param('recordingId') recordingId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.getRecording(workspaceId, recordingId), {
      requestId: request.requestId,
    });
  }

  @Post('recordings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 512_000 },
    }),
  )
  async uploadRecording(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: UploadedSourceFile | undefined,
    @Body('canonicalTestId') canonicalTestId: string | undefined,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    if (file && !ALLOWED_UPLOAD_MIMETYPES.has(file.mimetype)) {
      throw badRequest('INVALID_FILE_TYPE', `File type "${file.mimetype}" is not allowed.`);
    }
    return success(
      await this.recordingsService.uploadRecording(
        workspaceId,
        file,
        auth,
        request.resourceTenantId as string,
        request.requestId,
        canonicalTestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('tests')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listTests(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.listTests(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('tests/:testId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getTest(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.getTest(workspaceId, testId), {
      requestId: request.requestId,
    });
  }

  @Patch('tests/:testId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async updateTest(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.recordingsService.updateTest(
        workspaceId,
        testId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('tests/:testId/repair-attempts')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getRepairAttempts(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.getRepairAttempts(workspaceId, testId), {
      requestId: request.requestId,
    });
  }

  @Get('repair-analytics')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getRepairAnalytics(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.getRepairAnalytics(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('flakiness-report')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getFlakinessReport(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.getFlakinessReport(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('test-health')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getTestHealth(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    const days = query['days'] ? parseInt(query['days'], 10) : undefined;
    return success(await this.testHealthService.getHealthReport(workspaceId, days), {
      requestId: request.requestId,
    });
  }

  @Get('test-health/trend')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getTestHealthTrend(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    const days = query['days'] ? parseInt(query['days'], 10) : undefined;
    return success(await this.testHealthService.getHealthTrend(workspaceId, days), {
      requestId: request.requestId,
    });
  }

  @Post('tests/:testId/generate')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async generateTest(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.recordingsService.generateTest(
        workspaceId,
        testId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('tests/generate-from-prompt')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async generateTestFromPrompt(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.nlTestAuthoringService.generateFromPrompt(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('runs')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listRuns(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.listRuns(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('runs/compare')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async compareRuns(
    @Param('workspaceId') workspaceId: string,
    @Query('runIdA') runIdA: string,
    @Query('runIdB') runIdB: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.compareRuns(workspaceId, runIdA, runIdB), {
      requestId: request.requestId,
    });
  }

  @Get('runs/:runId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getRun(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.getRun(workspaceId, runId), {
      requestId: request.requestId,
    });
  }

  @Get('runs/:runId/items')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listRunItems(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.recordingsService.listRunItems(workspaceId, runId), {
      requestId: request.requestId,
    });
  }

  @Post('runs')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async createRun(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.recordingsService.createRun(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('runs/:runId/cancel')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async cancelRun(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.recordingsService.cancelRun(
        workspaceId,
        runId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('tests/:testId/generated-artifacts/:artifactId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getGeneratedArtifact(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Param('artifactId') artifactId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.recordingsService.getGeneratedArtifact(workspaceId, testId, artifactId),
      { requestId: request.requestId },
    );
  }

  @Post('tests/:testId/generated-artifacts/:artifactId/publish')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  @RequireLicense('artifact_publication')
  async publishGeneratedArtifact(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Param('artifactId') artifactId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubPublicationService.publishArtifact(
        workspaceId,
        testId,
        artifactId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('tests/:testId/generated-artifacts/:artifactId/publication/replay')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  @RequireLicense('artifact_publication')
  async replayGeneratedArtifactPublication(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Param('artifactId') artifactId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubPublicationService.replayPublication(
        workspaceId,
        testId,
        artifactId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('tests/:testId/generated-artifacts/:artifactId/artifacts/:validationArtifactId/download')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async downloadValidationArtifact(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Param('artifactId') artifactId: string,
    @Param('validationArtifactId') validationArtifactId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.recordingsService.issueValidationArtifactDownloadUrl(
      workspaceId,
      testId,
      artifactId,
      validationArtifactId,
      auth,
      request.resourceTenantId as string,
      request.requestId,
    );
    response.redirect(download.url);
  }

  @Get('runs/:runId/items/:itemId/artifacts/:artifactId/download')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async downloadRunArtifact(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Param('itemId') itemId: string,
    @Param('artifactId') artifactId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.recordingsService.issueRunArtifactDownloadUrl(
      workspaceId,
      runId,
      itemId,
      artifactId,
      auth,
      request.resourceTenantId as string,
      request.requestId,
    );
    response.redirect(download.url);
  }

  @Get('artifact-downloads/:token')
  async downloadSignedArtifact(
    @Param('workspaceId') workspaceId: string,
    @Param('token') token: string,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.recordingsService.resolveSignedArtifactDownload(
      workspaceId,
      token,
      request.requestId,
    );

    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `${file.disposition}; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }

  @Post('tests/:testId/generated-artifacts/:artifactId/repair')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async triggerRepair(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Param('artifactId') artifactId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    await this.aiRepairQueue.enqueue({
      generatedTestArtifactId: artifactId,
      canonicalTestId: testId,
      workspaceId,
      tenantId: request.resourceTenantId as string,
      actorUserId: auth.user.id,
      requestId: request.requestId,
    });
    return success({ queued: true }, { requestId: request.requestId });
  }

  /**
   * POST /workspaces/:id/runs/:runId/repair-failures
   * Webhook-friendly endpoint: auto-trigger repair on all failed tests in a run.
   */
  @Post('runs/:runId/repair-failures')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async repairRunFailures(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    const items = await this.prisma.testRunItem.findMany({
      where: { testRunId: runId, testRun: { workspaceId }, status: 'FAILED' },
      select: {
        canonicalTestId: true,
        generatedTestArtifactId: true,
      },
    });

    let queued = 0;
    for (const item of items) {
      if (!item.canonicalTestId || !item.generatedTestArtifactId) continue;
      await this.aiRepairQueue.enqueue({
        generatedTestArtifactId: item.generatedTestArtifactId,
        canonicalTestId: item.canonicalTestId,
        workspaceId,
        tenantId: request.resourceTenantId as string,
        actorUserId: auth.user.id,
        requestId: request.requestId,
      });
      queued++;
    }

    return success({ queued, totalFailed: items.length }, { requestId: request.requestId });
  }
}