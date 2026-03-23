import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MembershipRole, MembershipStatus, TenantStatus } from '@prisma/client';
import { forbidden, notFound } from '../common/http-errors';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { resolveTenantRole } from './membership-role.utils';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const tenantId = this.readRouteParam(request.params['tenantId'], 'tenantId');
    const auth = request.auth;

    if (!auth) {
      throw forbidden('AUTH_REQUIRED', 'Authentication is required.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw notFound('TENANT_NOT_FOUND', 'Tenant was not found.');
    }

    const effectiveRole = resolveTenantRole(auth.user.memberships, tenantId);

    if (!effectiveRole) {
      throw forbidden('TENANT_ACCESS_DENIED', 'You do not have access to this tenant.');
    }

    if (this.isMutatingRequest(request.method) && !this.isTenantLifecycleRoute(request)) {
      if (tenant.softDeleteRequestedAt) {
        throw forbidden(
          'TENANT_SOFT_DELETE_PENDING',
          'Tenant changes are blocked while soft-delete is pending cancellation or cleanup.',
        );
      }

      if (tenant.status !== TenantStatus.ACTIVE) {
        throw forbidden(
          'TENANT_INACTIVE',
          tenant.status === TenantStatus.SUSPENDED
            ? 'Tenant changes are blocked while the tenant is suspended.'
            : 'Tenant changes are blocked while the tenant is archived.',
        );
      }
    }

    request.resourceTenantId = tenantId;
    request.resourceRole = effectiveRole;
    return true;
  }

  private isMutatingRequest(method: string | undefined) {
    return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  }

  private isTenantLifecycleRoute(request: AppRequest) {
    return request.method === 'PATCH' && /^\/api\/v1\/tenants\/[^/]+\/?$/.test(request.path);
  }

  private readRouteParam(value: string | string[] | undefined, fieldName: string) {
    if (typeof value !== 'string') {
      throw notFound('ROUTE_PARAM_INVALID', `${fieldName} is invalid.`);
    }

    return value;
  }
}