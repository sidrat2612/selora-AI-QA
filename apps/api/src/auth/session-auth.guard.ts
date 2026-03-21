import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AppRequest } from '../common/types';
import { RequestRateLimitService } from '../rate-limits/request-rate-limit.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly requestRateLimitService: RequestRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const response = context.switchToHttp().getResponse();
    const sessionToken = request.cookies?.['selora_session'];
    const auth = await this.authService.authenticateRequest({
      sessionToken,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    request.auth = auth;
    await this.requestRateLimitService.consumeAuthenticatedRequest(request, response, auth);
    return true;
  }
}