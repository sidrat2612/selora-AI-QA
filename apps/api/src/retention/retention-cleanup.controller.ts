import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { RetentionCleanupService } from './retention-cleanup.service';

@Controller('admin/retention')
export class RetentionCleanupController {
  constructor(private readonly retentionCleanupService: RetentionCleanupService) {}

  @Post('cleanup')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @RequireRoles(MembershipRole.PLATFORM_ADMIN)
  async triggerCleanup(@Req() request: AppRequest) {
    const summary = await this.retentionCleanupService.runCleanup();
    return success(summary, { requestId: request.requestId });
  }
}
