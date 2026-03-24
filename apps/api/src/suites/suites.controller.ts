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
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { SuitesService } from './suites.service';

@Controller()
export class SuitesController {
  constructor(private readonly suitesService: SuitesService) {}

  @Get('workspaces/:workspaceId/suites')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listSuites(@Param('workspaceId') workspaceId: string, @Req() request: AppRequest) {
    return success(await this.suitesService.listSuites(workspaceId), {
      requestId: request.requestId,
    });
  }

  @Post('workspaces/:workspaceId/suites')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async createSuite(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.suitesService.createSuite(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Get('workspaces/:workspaceId/suites/:suiteId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getSuiteDetails(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.suitesService.getSuiteDetails(workspaceId, suiteId), {
      requestId: request.requestId,
    });
  }

  @Patch('workspaces/:workspaceId/suites/:suiteId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async updateSuite(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.suitesService.updateSuite(
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

  @Delete('workspaces/:workspaceId/suites/:suiteId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async deleteSuite(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.suitesService.deleteSuite(
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