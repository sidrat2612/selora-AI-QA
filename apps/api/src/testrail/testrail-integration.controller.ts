import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { TestRailIntegrationService } from './testrail-integration.service';

@Controller('workspaces/:workspaceId/suites/:suiteId')
export class TestRailIntegrationController {
  constructor(private readonly testRailIntegrationService: TestRailIntegrationService) {}

  @Patch('testrail-integration')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async upsertIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testRailIntegrationService.upsertIntegration(
        workspaceId,
        suiteId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('testrail-integration/validate')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async validateIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testRailIntegrationService.validateIntegration(
        workspaceId,
        suiteId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('testrail-integration')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async deleteIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testRailIntegrationService.deleteIntegration(
        workspaceId,
        suiteId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('testrail-integration/sync')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async syncIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testRailIntegrationService.syncSuite(
        workspaceId,
        suiteId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Patch('testrail-links/:testId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async upsertCaseLink(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testId') testId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testRailIntegrationService.upsertCaseLink(
        workspaceId,
        suiteId,
        testId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('testrail-links/:testId/retry')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async retryCaseLink(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testId') testId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testRailIntegrationService.retryCaseLink(
        workspaceId,
        suiteId,
        testId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }
}
