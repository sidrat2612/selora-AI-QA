import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { WorkspacesService } from './workspaces.service';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('tenants/:tenantId/workspaces')
  @UseGuards(SessionAuthGuard, TenantAccessGuard)
  async listTenantWorkspaces(
    @Param('tenantId') tenantId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(await this.workspacesService.listTenantWorkspaces(tenantId, auth), {
      requestId: request.requestId,
    });
  }

  @Post('tenants/:tenantId/workspaces')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async createWorkspace(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.createWorkspace(tenantId, body, auth, request.requestId),
      { requestId: request.requestId },
    );
  }

  @Get('workspaces/:workspaceId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getWorkspaceDetails(@Param('workspaceId') workspaceId: string, @Req() request: AppRequest) {
    return success(await this.workspacesService.getWorkspaceDetails(workspaceId), {
      requestId: request.requestId,
    });
  }

  @Get('workspaces/:workspaceId/memberships')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listMemberships(@Param('workspaceId') workspaceId: string, @Req() request: AppRequest) {
    return success(await this.workspacesService.listMemberships(workspaceId), {
      requestId: request.requestId,
    });
  }

  @Post('workspaces/:workspaceId/memberships')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async createMembership(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.createMembership(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Patch('workspaces/:workspaceId/memberships/:membershipId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async updateMembership(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.updateMembership(
        workspaceId,
        membershipId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('workspaces/:workspaceId/memberships/:membershipId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async deleteMembership(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.deleteMembership(
        workspaceId,
        membershipId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('workspaces/:workspaceId/environments')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listEnvironments(@Param('workspaceId') workspaceId: string, @Req() request: AppRequest) {
    return success(await this.workspacesService.listEnvironments(workspaceId), {
      requestId: request.requestId,
    });
  }

  @Post('workspaces/:workspaceId/environments')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async createEnvironment(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.createEnvironment(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Patch('workspaces/:workspaceId/environments/:environmentId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async updateEnvironment(
    @Param('workspaceId') workspaceId: string,
    @Param('environmentId') environmentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.updateEnvironment(
        workspaceId,
        environmentId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('workspaces/:workspaceId/settings/retention')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getRetention(@Param('workspaceId') workspaceId: string, @Req() request: AppRequest) {
    return success(await this.workspacesService.getRetention(workspaceId), {
      requestId: request.requestId,
    });
  }

  @Patch('workspaces/:workspaceId/settings/retention')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async updateRetention(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.updateRetention(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('workspaces/:workspaceId/environments/:environmentId/clone')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async cloneEnvironment(
    @Param('workspaceId') workspaceId: string,
    @Param('environmentId') environmentId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.cloneEnvironment(
        workspaceId,
        environmentId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Patch('workspaces/:workspaceId/settings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async updateWorkspaceSettings(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.workspacesService.updateWorkspaceSettings(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }
}