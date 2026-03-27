import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { forbidden } from '../common/http-errors';
import type { AppRequest } from '../common/types';

/**
 * Guard for platform-level endpoints that don't have a workspace or tenant param.
 * Checks if the authenticated user has at least one PLATFORM_ADMIN membership.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const auth = request.auth;

    if (!auth) {
      throw forbidden('AUTH_REQUIRED', 'Authentication is required.');
    }

    const isPlatformAdmin = auth.user.memberships.some(
      (m) => m.role === MembershipRole.PLATFORM_ADMIN && m.status === 'ACTIVE',
    );

    if (!isPlatformAdmin) {
      throw forbidden('PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required.');
    }

    return true;
  }
}
