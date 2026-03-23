import { Controller, Delete, Param, Patch, Post, Req, Body, UseGuards } from '@nestjs/common';
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
import { GitHubIntegrationService } from './github-integration.service';

@Controller()
export class GitHubIntegrationController {
  constructor(private readonly githubIntegrationService: GitHubIntegrationService) {}

  @Patch('workspaces/:workspaceId/suites/:suiteId/github-integration')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('github_integration')
  async upsertIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubIntegrationService.upsertIntegration(
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

  @Post('workspaces/:workspaceId/suites/:suiteId/github-integration/validate')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('github_integration')
  async validateIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubIntegrationService.revalidateIntegration(
        workspaceId,
        suiteId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('workspaces/:workspaceId/suites/:suiteId/github-integration')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
  )
  @RequireLicense('github_integration')
  async deleteIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubIntegrationService.deleteIntegration(
        workspaceId,
        suiteId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }
}