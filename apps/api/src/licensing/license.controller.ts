import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { LicenseService } from './license.service';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get('status')
  @UseGuards(SessionAuthGuard)
  async getStatus(@Req() request: AppRequest) {
    return success(this.licenseService.getStatus(), {
      requestId: request.requestId,
    });
  }
}
