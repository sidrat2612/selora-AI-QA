import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { LicenseGuard } from '../licensing/license.guard';
import { RequireLicense } from '../licensing/require-license.decorator';
import { TestRailIntegrationService } from './testrail-integration.service';

@Controller('workspaces/:workspaceId/suites/:suiteId')
export class TestRailIntegrationController {
  constructor(private readonly testRailIntegrationService: TestRailIntegrationService) {}

  @Patch('testrail-integration')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('testrail_integration')
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
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('testrail_integration')
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
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('testrail_integration')
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
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('testrail_integration')
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
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('testrail_integration')
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
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('testrail_integration')
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
