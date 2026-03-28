import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { SmartSelectionService, type GitDiffInput } from './smart-selection.service';
import { RecordingsService } from './recordings.service';

@Controller('workspaces/:workspaceId/smart-selection')
export class SmartSelectionController {
  constructor(
    private readonly smartSelectionService: SmartSelectionService,
    private readonly recordingsService: RecordingsService,
  ) {}

  /**
   * POST /workspaces/:id/smart-selection/analyse
   * Analyse a git diff and return which tests are affected.
   */
  @Post('analyse')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async analyseGitDiff(
    @Param('workspaceId') workspaceId: string,
    @Body() body: GitDiffInput & { suiteId?: string },
    @Req() request: AppRequest,
  ) {
    const result = await this.smartSelectionService.selectTests(
      workspaceId,
      body.suiteId,
      body,
    );
    return success(result, { requestId: request.requestId });
  }

  /**
   * POST /workspaces/:id/smart-selection/runs
   * Create a run using smart test selection (only affected tests + safety sample).
   */
  @Post('runs')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async createSmartRun(
    @Param('workspaceId') workspaceId: string,
    @Body() body: GitDiffInput & { suiteId?: string; environmentId: string },
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    // 1. Analyse which tests to run
    const selection = await this.smartSelectionService.selectTests(
      workspaceId,
      body.suiteId,
      body,
    );

    // 2. Create a normal run with only the selected+sample test IDs
    const allTestIds = [...selection.selectedTestIds, ...selection.randomSampleIds];
    const run = await this.recordingsService.createRun(
      workspaceId,
      {
        environmentId: body.environmentId,
        suiteId: body.suiteId,
        testIds: allTestIds,
      },
      auth,
      request.resourceTenantId as string,
      request.requestId,
    );

    // 3. Record the smart selection metadata
    const runId = (run as { id: string }).id;
    await this.smartSelectionService.recordSelectionRun(workspaceId, runId, body, selection);

    return success(
      { run, selection },
      { requestId: request.requestId },
    );
  }

  /**
   * GET /workspaces/:id/smart-selection/runs/:runId
   * Get smart selection metadata for a specific run.
   */
  @Get('runs/:runId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getSelectionForRun(
    @Param('runId') runId: string,
    @Req() request: AppRequest,
  ) {
    const selection = await this.smartSelectionService.getSelectionForRun(runId);
    return success(selection, { requestId: request.requestId });
  }

  // ─── File Mappings ──────────────────────────────────────

  /**
   * GET /workspaces/:id/smart-selection/mappings
   */
  @Get('mappings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listMappings(
    @Param('workspaceId') workspaceId: string,
    @Query('testId') testId: string | undefined,
    @Req() request: AppRequest,
  ) {
    const mappings = await this.smartSelectionService.listMappings(workspaceId, testId);
    return success(mappings, { requestId: request.requestId });
  }

  /**
   * POST /workspaces/:id/smart-selection/mappings
   */
  @Post('mappings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async upsertMapping(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { testId: string; filePattern: string; routePattern?: string; confidence?: number },
    @Req() request: AppRequest,
  ) {
    const mapping = await this.smartSelectionService.upsertMapping(
      workspaceId,
      body.testId,
      body.filePattern,
      { routePattern: body.routePattern, confidence: body.confidence },
    );
    return success(mapping, { requestId: request.requestId });
  }

  /**
   * DELETE /workspaces/:id/smart-selection/mappings/:mappingId
   */
  @Delete('mappings/:mappingId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async deleteMapping(
    @Param('workspaceId') workspaceId: string,
    @Param('mappingId') mappingId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.smartSelectionService.deleteMapping(workspaceId, mappingId),
      { requestId: request.requestId },
    );
  }
}
