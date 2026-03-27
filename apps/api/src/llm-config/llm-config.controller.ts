import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { LlmConfigService } from './llm-config.service';

@Controller()
export class LlmConfigController {
  constructor(private readonly llmConfigService: LlmConfigService) {}

  @Get('platform/llm-configs')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN)
  async listAllConfigs(@Req() request: AppRequest) {
    return success(await this.llmConfigService.listAllConfigs(), {
      requestId: request.requestId,
    });
  }

  @Get('workspaces/:workspaceId/llm-config')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getConfig(
    @Param('workspaceId') workspaceId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.llmConfigService.getConfig(workspaceId), {
      requestId: request.requestId,
    });
  }

  @Put('workspaces/:workspaceId/llm-config')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async upsertConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.upsertConfig(
        workspaceId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('workspaces/:workspaceId/llm-config')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async deleteConfig(
    @Param('workspaceId') workspaceId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.deleteConfig(
        workspaceId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('workspaces/:workspaceId/llm-config/test')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async testConnection(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(await this.llmConfigService.testConnection(workspaceId, body), {
      requestId: request.requestId,
    });
  }

  @Get('llm-config/providers')
  @UseGuards(SessionAuthGuard)
  async getProviderPresets(@Req() request: AppRequest) {
    return success(this.llmConfigService.getProviderPresets(), {
      requestId: request.requestId,
    });
  }
}
