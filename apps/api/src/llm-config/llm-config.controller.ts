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
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { LlmConfigService } from './llm-config.service';

@Controller()
export class LlmConfigController {
  constructor(private readonly llmConfigService: LlmConfigService) {}

  // ─── Platform LLM Configs (Platform Admin) ───────────────────────────

  @Get('platform/llm-configs')
  @UseGuards(SessionAuthGuard, PlatformAdminGuard)
  async listPlatformConfigs(@Req() request: AppRequest) {
    return success(await this.llmConfigService.listPlatformConfigs(), {
      requestId: request.requestId,
    });
  }

  @Get('platform/llm-configs/:id')
  @UseGuards(SessionAuthGuard, PlatformAdminGuard)
  async getPlatformConfig(
    @Param('id') id: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.llmConfigService.getPlatformConfig(id), {
      requestId: request.requestId,
    });
  }

  @Post('platform/llm-configs')
  @UseGuards(SessionAuthGuard, PlatformAdminGuard)
  async createPlatformConfig(
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.createPlatformConfig(body),
      { requestId: request.requestId },
    );
  }

  @Put('platform/llm-configs/:id')
  @UseGuards(SessionAuthGuard, PlatformAdminGuard)
  async updatePlatformConfig(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.updatePlatformConfig(id, body),
      { requestId: request.requestId },
    );
  }

  @Delete('platform/llm-configs/:id')
  @UseGuards(SessionAuthGuard, PlatformAdminGuard)
  async deletePlatformConfig(
    @Param('id') id: string,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.deletePlatformConfig(id),
      { requestId: request.requestId },
    );
  }

  @Post('platform/llm-configs/test')
  @UseGuards(SessionAuthGuard, PlatformAdminGuard)
  async testConnection(
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    const configId = typeof body['configId'] === 'string' ? body['configId'] : undefined;
    return success(await this.llmConfigService.testConnection(body, configId), {
      requestId: request.requestId,
    });
  }

  // ─── Tenant LLM Selection ────────────────────────────────────────────

  @Get('tenants/:tenantId/llm-selection')
  @UseGuards(SessionAuthGuard, TenantAccessGuard)
  async getTenantSelection(
    @Param('tenantId') tenantId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.llmConfigService.getTenantSelection(tenantId), {
      requestId: request.requestId,
    });
  }

  @Put('tenants/:tenantId/llm-selection')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async selectForTenant(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    const platformLlmConfigId = body['platformLlmConfigId'];
    if (typeof platformLlmConfigId !== 'string' || !platformLlmConfigId.trim()) {
      return success(null, { requestId: request.requestId });
    }
    return success(
      await this.llmConfigService.selectForTenant(
        tenantId,
        platformLlmConfigId,
        auth,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('tenants/:tenantId/llm-selection')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async clearTenantSelection(
    @Param('tenantId') tenantId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.clearTenantSelection(tenantId, auth, request.requestId),
      { requestId: request.requestId },
    );
  }

  // ─── Tenant BYO Custom Config ────────────────────────────────────────

  @Put('tenants/:tenantId/llm-custom')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async saveTenantCustomConfig(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.saveTenantCustomConfig(
        tenantId,
        body,
        auth,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('tenants/:tenantId/llm-custom/test')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async testTenantConnection(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.llmConfigService.testTenantConnection(tenantId, body),
      { requestId: request.requestId },
    );
  }

  // ─── Available configs (for tenant admins to browse) ─────────────────

  @Get('llm-configs/available')
  @UseGuards(SessionAuthGuard)
  async listAvailableConfigs(@Req() request: AppRequest) {
    return success(await this.llmConfigService.listAvailableConfigs(), {
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
