import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { AuditService } from './audit.service';

@Controller('workspaces/:workspaceId/audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async listEvents(
    @Param('workspaceId') workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AppRequest,
  ) {
    return success(await this.auditService.listEvents(workspaceId, query), {
      requestId: request.requestId,
    });
  }

  @Get('event-types')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.WORKSPACE_OPERATOR,
  )
  async getEventTypes(
    @Param('workspaceId') workspaceId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.auditService.getDistinctEventTypes(workspaceId), {
      requestId: request.requestId,
    });
  }
}
