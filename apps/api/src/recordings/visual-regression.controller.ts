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
import { VisualDiffService } from './visual-diff.service';

@Controller('workspaces/:workspaceId/visual')
@UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
export class VisualRegressionController {
  constructor(private readonly visualDiffService: VisualDiffService) {}

  @Get('tests/:testId/baselines')
  async listBaselines(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.visualDiffService.listBaselines(workspaceId, testId),
      { requestId: request.requestId },
    );
  }

  @Post('tests/:testId/baselines')
  @UseGuards(RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async upsertBaseline(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Body() body: { stepIndex: number; imageBase64: string; stepLabel?: string; width?: number; height?: number },
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.visualDiffService.upsertBaseline(
        workspaceId,
        testId,
        body.stepIndex,
        body,
        auth.user.id,
        request.resourceTenantId as string,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('baselines/:baselineId')
  @UseGuards(RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async deleteBaseline(
    @Param('workspaceId') workspaceId: string,
    @Param('baselineId') baselineId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.visualDiffService.deleteBaseline(workspaceId, baselineId),
      { requestId: request.requestId },
    );
  }

  @Get('tests/:testId/compare')
  async compareScreenshots(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Query('runItemId') runItemId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.visualDiffService.compareRunScreenshots(
        workspaceId,
        testId,
        runItemId,
        request.resourceTenantId as string,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('tests/:testId/approve-baseline')
  @UseGuards(RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async approveAsBaseline(
    @Param('workspaceId') workspaceId: string,
    @Param('testId') testId: string,
    @Body() body: { runItemId: string; stepIndex: number },
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.visualDiffService.approveScreenshotAsBaseline(
        workspaceId,
        testId,
        body.runItemId,
        body.stepIndex,
        auth.user.id,
        request.resourceTenantId as string,
      ),
      { requestId: request.requestId },
    );
  }
}
