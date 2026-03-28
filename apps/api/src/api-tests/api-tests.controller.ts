import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ApiTestService } from './api-test.service';

@Controller('workspaces/:workspaceId/api-tests')
export class ApiTestsController {
  constructor(
    private readonly apiTestService: ApiTestService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────

  @Get()
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query('suiteId') suiteId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.list(workspaceId, {
        suiteId,
        status,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
      { requestId: request.requestId },
    );
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.get(workspaceId, id),
      { requestId: request.requestId },
    );
  }

  @Post()
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.create(
        workspaceId,
        body as Parameters<ApiTestService['create']>[1],
        auth.user.id,
      ),
      { requestId: request.requestId },
    );
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.update(
        workspaceId,
        id,
        body as Parameters<ApiTestService['update']>[2],
      ),
      { requestId: request.requestId },
    );
  }

  @Delete(':id')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.delete(workspaceId, id),
      { requestId: request.requestId },
    );
  }

  // ─── Execution ─────────────────────────────────────────

  @Post(':id/execute')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async execute(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() body: { environmentId: string; testRunId?: string },
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.execute(workspaceId, id, body.environmentId, body.testRunId),
      { requestId: request.requestId },
    );
  }

  @Get(':id/executions')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listExecutions(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.listExecutions(workspaceId, id, {
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
      { requestId: request.requestId },
    );
  }

  @Get('executions/:executionId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getExecution(
    @Param('workspaceId') workspaceId: string,
    @Param('executionId') executionId: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.apiTestService.getExecution(workspaceId, executionId),
      { requestId: request.requestId },
    );
  }
}
