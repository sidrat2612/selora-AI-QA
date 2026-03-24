import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TenantStatus, WorkspaceStatus } from '@prisma/client';
import { forbidden, notFound } from '../common/http-errors';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { resolveWorkspaceRole } from './membership-role.utils';

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const workspaceId = this.readRouteParam(request.params['workspaceId'], 'workspaceId');
    const auth = request.auth;

    if (!auth) {
      throw forbidden('AUTH_REQUIRED', 'Authentication is required.');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        tenant: {
          select: {
            id: true,
            status: true,
            softDeleteRequestedAt: true,
          },
        },
      },
    });
    if (!workspace) {
      throw notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.');
    }

    const effectiveRole = resolveWorkspaceRole(auth.user.memberships, workspace.tenantId, workspaceId);
    if (!effectiveRole) {
      throw forbidden('WORKSPACE_ACCESS_DENIED', 'You do not have access to this workspace.');
    }

    if (this.isMutatingRequest(request.method)) {
      if (workspace.tenant.softDeleteRequestedAt) {
        throw forbidden(
          'TENANT_SOFT_DELETE_PENDING',
          'Workspace changes are blocked while tenant soft-delete is pending cancellation or cleanup.',
        );
      }

      if (workspace.tenant.status !== TenantStatus.ACTIVE) {
        throw forbidden(
          'TENANT_INACTIVE',
          workspace.tenant.status === TenantStatus.SUSPENDED
            ? 'Workspace changes are blocked while the tenant is suspended.'
            : 'Workspace changes are blocked while the tenant is archived.',
        );
      }

      if (workspace.status !== WorkspaceStatus.ACTIVE && !this.isWorkspaceLifecycleRoute(request)) {
        throw forbidden('WORKSPACE_INACTIVE', 'Workspace changes are blocked while the workspace is not active.');
      }
    }

    request.resourceWorkspaceId = workspaceId;
    request.resourceTenantId = workspace.tenantId;
    request.resourceRole = effectiveRole;
    return true;
  }

  private isMutatingRequest(method: string | undefined) {
    return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  }

  private isWorkspaceLifecycleRoute(request: AppRequest) {
    return (
      /^\/api\/v1\/workspaces\/[^/]+\/lifecycle\/?$/.test(request.path) ||
      (request.method === 'DELETE' && /^\/api\/v1\/workspaces\/[^/]+\/?$/.test(request.path))
    );
  }

  private readRouteParam(value: string | string[] | undefined, fieldName: string) {
    if (typeof value !== 'string') {
      throw notFound('ROUTE_PARAM_INVALID', `${fieldName} is invalid.`);
    }

    return value;
  }
}