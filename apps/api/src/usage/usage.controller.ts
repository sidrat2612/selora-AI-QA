import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { UsageMeterService } from './usage-meter.service';

@Controller()
export class UsageController {
  constructor(private readonly usageMeterService: UsageMeterService) {}

  @Get('workspaces/:workspaceId/usage')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async getWorkspaceUsage(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.usageMeterService.getWorkspaceUsage(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('tenants/:tenantId/usage')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async getTenantUsage(
    @Param('tenantId') tenantId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.usageMeterService.getTenantUsage(tenantId, query), {
      requestId: request.requestId,
    });
  }
}
