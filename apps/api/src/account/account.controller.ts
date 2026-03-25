import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AccountService } from './account.service';

@Controller('account')
@UseGuards(SessionAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('profile')
  async getProfile(@CurrentAuth() auth: NonNullable<AppRequest['auth']>, @Req() request: AppRequest) {
    return success(await this.accountService.getProfile(auth.user.id), { requestId: request.requestId });
  }

  @Patch('profile')
  async updateProfile(
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(await this.accountService.updateProfile(auth.user.id, body), { requestId: request.requestId });
  }

  @Get('preferences')
  async getPreferences(@CurrentAuth() auth: NonNullable<AppRequest['auth']>, @Req() request: AppRequest) {
    return success(await this.accountService.getPreferences(auth.user.id), { requestId: request.requestId });
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Body() body: Record<string, unknown>,
    @Req() request: AppRequest,
  ) {
    return success(await this.accountService.updatePreferences(auth.user.id, body), { requestId: request.requestId });
  }
}