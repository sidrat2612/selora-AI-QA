import type { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';
import type { Request } from 'express';

export type AuthMembership = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  passwordVersion: number;
  memberships: AuthMembership[];
};

export type RequestAuthContext = {
  sessionId: string;
  activeWorkspaceId: string | null;
  user: AuthUser;
};

export type AppRequest = Request & {
  requestId: string;
  rawBody?: Buffer;
  auth?: RequestAuthContext;
  resourceRole?: MembershipRole;
  resourceTenantId?: string;
  resourceWorkspaceId?: string;
  resourceSuiteId?: string;
};