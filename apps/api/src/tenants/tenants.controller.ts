import { Controller, Get, Param, Patch, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { TenantsService } from './tenants.service';

@Controller('tenants/:tenantId')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async getTenantLifecycle(@Param('tenantId') tenantId: string, @Req() request: AppRequest) {
    return success(await this.tenantsService.getTenantLifecycle(tenantId), {
      requestId: request.requestId,
    });
  }

  @Patch()
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async updateTenantLifecycle(
    @Param('tenantId') tenantId: string,
    @Req() request: AppRequest,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() _unusedRequestBodyCarrier: AppRequest,
  ) {
    return success(
      await this.tenantsService.updateTenantLifecycle(tenantId, request.body as Record<string, unknown>, auth, request.requestId),
      { requestId: request.requestId },
    );
  }

  @Get('export')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async exportTenantData(
    @Param('tenantId') tenantId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.tenantsService.buildTenantExport(tenantId, query, auth, request.requestId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.buffer);
  }
}