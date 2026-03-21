import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { CurrentAuth } from './current-auth.decorator';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: Record<string, unknown>, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    const email = typeof body['email'] === 'string' ? body['email'] : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';

    const { sessionToken, auth } = await this.authService.login({
      email,
      password,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.requestId,
    });

    response.cookie(
      this.authService.getSessionCookieName(),
      sessionToken,
      this.authService.getSessionCookieOptions(),
    );

    return success(await this.authService.getSession(auth), { requestId: request.requestId });
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  async logout(
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout({
      sessionId: auth.sessionId,
      actorUserId: auth.user.id,
      tenantId: auth.user.memberships[0]?.tenantId ?? 'unknown',
      requestId: request.requestId,
    });

    response.clearCookie(this.authService.getSessionCookieName(), this.authService.getSessionCookieOptions());
    return success({ loggedOut: true }, { requestId: request.requestId });
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  async getSession(@CurrentAuth() auth: NonNullable<AppRequest['auth']>, @Req() request: AppRequest) {
    return success(await this.authService.getSession(auth), { requestId: request.requestId });
  }

  @Post('verify-email')
  @Throttle({ auth: { limit: 5, ttl: 900_000 } })
  async verifyEmail(@Body() body: Record<string, unknown>, @Req() request: AppRequest) {
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    return success(await this.authService.verifyEmail({ token, requestId: request.requestId }), {
      requestId: request.requestId,
    });
  }

  @Post('forgot-password')
  @Throttle({ auth: { limit: 3, ttl: 900_000 } })
  async forgotPassword(@Body() body: Record<string, unknown>, @Req() request: AppRequest) {
    const email = typeof body['email'] === 'string' ? body['email'] : '';
    return success(await this.authService.forgotPassword({ email, requestId: request.requestId }), {
      requestId: request.requestId,
    });
  }

  @Post('reset-password')
  @Throttle({ auth: { limit: 5, ttl: 900_000 } })
  async resetPassword(@Body() body: Record<string, unknown>, @Req() request: AppRequest) {
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    const newPassword = typeof body['newPassword'] === 'string' ? body['newPassword'] : '';
    return success(
      await this.authService.resetPassword({ token, newPassword, requestId: request.requestId }),
      {
        requestId: request.requestId,
      },
    );
  }
}