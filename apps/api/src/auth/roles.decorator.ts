import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';

export const REQUIRED_ROLES_KEY = 'required_roles';

export const RequireRoles = (...roles: MembershipRole[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);