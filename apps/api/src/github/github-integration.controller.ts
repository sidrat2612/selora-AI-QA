import { Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, Body, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Response } from 'express';
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
import { GitHubPublicationService } from './github-publication.service';
import { RepositoryAllowlistService } from './repository-allowlist.service';

@Controller()
export class GitHubIntegrationController {
  constructor(
    private readonly githubIntegrationService: GitHubIntegrationService,
    private readonly githubPublicationService: GitHubPublicationService,
    private readonly repositoryAllowlistService: RepositoryAllowlistService,
  ) {}

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
    const result = await this.githubIntegrationService.deleteIntegration(
      workspaceId,
      suiteId,
      auth,
      request.resourceTenantId as string,
      request.requestId,
    );

    // Best-effort cleanup of the suite branch and PR on GitHub
    if (result.cleanupContext) {
      this.githubPublicationService
        .cleanupSuiteBranch(result.cleanupContext)
        .catch(() => {});
    }

    return success({ removed: result.removed }, { requestId: request.requestId });
  }

  @Get('workspaces/:workspaceId/suites/:suiteId/github-integration/install-url')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  @RequireLicense('github_integration')
  async getInstallUrl(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      this.githubIntegrationService.buildInstallUrl(workspaceId, suiteId),
      { requestId: request.requestId },
    );
  }

  @Get('workspaces/:workspaceId/suites/:suiteId/github-integration/publications')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, LicenseGuard)
  @RequireLicense('github_integration')
  async listPublications(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubPublicationService.listPublicationsForSuite(workspaceId, suiteId),
      { requestId: request.requestId },
    );
  }

  @Post('workspaces/:workspaceId/suites/:suiteId/github-integration/rotate-secret')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  @RequireLicense('github_integration')
  async rotateSecret(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubIntegrationService.rotateSecret(
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

  @Post('workspaces/:workspaceId/suites/:suiteId/github-integration/deliveries/:deliveryId/replay')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard, LicenseGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  @RequireLicense('github_integration')
  async replayDelivery(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.githubPublicationService.replaySingleDelivery(
        workspaceId,
        suiteId,
        deliveryId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('workspaces/:workspaceId/repository-allowlist')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listAllowlist(
    @Param('workspaceId') workspaceId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.repositoryAllowlistService.list(workspaceId),
      { requestId: request.requestId },
    );
  }

  @Post('workspaces/:workspaceId/repository-allowlist')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async addToAllowlist(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.repositoryAllowlistService.add(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('workspaces/:workspaceId/repository-allowlist/:entryId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async removeFromAllowlist(
    @Param('workspaceId') workspaceId: string,
    @Param('entryId') entryId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.repositoryAllowlistService.remove(
        workspaceId,
        entryId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('github/app/callback')
  async handleAppCallback(
    @Query('installation_id') installationId: string | undefined,
    @Query('setup_action') setupAction: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const redirectUrl = this.githubIntegrationService.resolveAppCallback(
      installationId,
      setupAction,
      state,
    );
    res.redirect(redirectUrl);
  }
}