import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { QuotaService } from './quota.service';

@Controller()
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get('tenants/:tenantId/quotas')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN, MembershipRole.TENANT_VIEWER)
  async getTenantQuotas(
    @Param('tenantId') tenantId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.quotaService.getTenantQuotaOverview(tenantId), {
      requestId: request.requestId,
    });
  }

  @Patch('tenants/:tenantId/quotas')
  @UseGuards(SessionAuthGuard, TenantAccessGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN)
  async updateTenantQuotas(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.quotaService.updateTenantQuotas(
        tenantId,
        body,
        request.auth!.user.id,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }
}