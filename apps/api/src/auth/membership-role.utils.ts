import { MembershipRole, MembershipStatus } from '@prisma/client';

type MembershipLike = {
  tenantId: string;
  workspaceId: string | null;
  role: MembershipRole;
  status: MembershipStatus;
};

const ROLE_PRECEDENCE: MembershipRole[] = [
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_ADMIN,
  MembershipRole.TENANT_OPERATOR,
  MembershipRole.TENANT_VIEWER,
];

const TENANT_WIDE_ROLES = new Set<MembershipRole>([
  MembershipRole.TENANT_ADMIN,
  MembershipRole.TENANT_OPERATOR,
  MembershipRole.TENANT_VIEWER,
]);

export function isTenantWideRole(role: MembershipRole) {
  return TENANT_WIDE_ROLES.has(role);
}

export function canManageWorkspaceRole(role: MembershipRole) {
  return (
    role === MembershipRole.PLATFORM_ADMIN ||
    role === MembershipRole.TENANT_ADMIN ||
    role === MembershipRole.TENANT_OPERATOR
  );
}

export function canViewWorkspaceRole(role: MembershipRole) {
  return (
    canManageWorkspaceRole(role) ||
    role === MembershipRole.TENANT_VIEWER
  );
}

export function resolveTenantRole(memberships: MembershipLike[], tenantId: string) {
  return resolveHighestRole(
    memberships.filter(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE &&
        (membership.role === MembershipRole.PLATFORM_ADMIN || membership.tenantId === tenantId),
    ),
  );
}

export function resolveWorkspaceRole(
  memberships: MembershipLike[],
  tenantId: string,
  workspaceId: string,
) {
  return resolveHighestRole(
    memberships.filter(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE &&
        (membership.role === MembershipRole.PLATFORM_ADMIN ||
          (membership.tenantId === tenantId &&
            (isTenantWideRole(membership.role) || membership.workspaceId === workspaceId))),
    ),
  );
}

export function roleSatisfiesRequirement(actualRole: MembershipRole, requiredRole: MembershipRole) {
  if (actualRole === requiredRole) {
    return true;
  }

  switch (requiredRole) {
    case MembershipRole.PLATFORM_ADMIN:
      return actualRole === MembershipRole.PLATFORM_ADMIN;
    case MembershipRole.TENANT_ADMIN:
      return actualRole === MembershipRole.PLATFORM_ADMIN || actualRole === MembershipRole.TENANT_ADMIN;
    case MembershipRole.TENANT_OPERATOR:
      return canManageWorkspaceRole(actualRole);
    case MembershipRole.TENANT_VIEWER:
      return canViewWorkspaceRole(actualRole);
    default:
      return false;
  }
}

function resolveHighestRole(memberships: MembershipLike[]) {
  for (const role of ROLE_PRECEDENCE) {
    if (memberships.some((membership) => membership.role === role)) {
      return role;
    }
  }

  return undefined;
}