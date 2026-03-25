import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { badRequest } from '../common/http-errors';

type AccountPreferences = {
  compactNavigation: boolean;
  emailNotifications: boolean;
  runDigest: boolean;
  autoOpenFailures: boolean;
};

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { workspace: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        tenantId: membership.tenantId,
        workspaceId: membership.workspaceId,
        role: membership.role,
        status: membership.status,
        workspaceName: membership.workspace?.name ?? null,
        workspaceSlug: membership.workspace?.slug ?? null,
      })),
    };
  }

  async updateProfile(userId: string, body: Record<string, unknown>) {
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    const avatarUrlRaw = body['avatarUrl'];
    const avatarUrl = typeof avatarUrlRaw === 'string' ? avatarUrlRaw.trim() : avatarUrlRaw === null ? null : undefined;

    if (!name) {
      throw badRequest('INVALID_PROFILE_NAME', 'Name is required.');
    }

    if (name.length > 120) {
      throw badRequest('INVALID_PROFILE_NAME', 'Name must be 120 characters or fewer.');
    }

    if (avatarUrl !== undefined && avatarUrl !== null) {
      try {
        const parsed = new URL(avatarUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid protocol');
        }
      } catch {
        throw badRequest('INVALID_AVATAR_URL', 'Avatar URL must be a valid HTTP or HTTPS URL.');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    return user;
  }

  async getPreferences(userId: string): Promise<AccountPreferences> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        prefersCompactNavigation: true,
        prefersEmailNotifications: true,
        prefersRunDigest: true,
        prefersAutoOpenFailures: true,
      },
    });

    return {
      compactNavigation: user.prefersCompactNavigation,
      emailNotifications: user.prefersEmailNotifications,
      runDigest: user.prefersRunDigest,
      autoOpenFailures: user.prefersAutoOpenFailures,
    };
  }

  async updatePreferences(userId: string, body: Record<string, unknown>): Promise<AccountPreferences> {
    const updates: Partial<AccountPreferences> = {};

    if (body['compactNavigation'] !== undefined) {
      if (typeof body['compactNavigation'] !== 'boolean') {
        throw badRequest('INVALID_PREFERENCE', 'compactNavigation must be a boolean.');
      }
      updates.compactNavigation = body['compactNavigation'];
    }

    if (body['emailNotifications'] !== undefined) {
      if (typeof body['emailNotifications'] !== 'boolean') {
        throw badRequest('INVALID_PREFERENCE', 'emailNotifications must be a boolean.');
      }
      updates.emailNotifications = body['emailNotifications'];
    }

    if (body['runDigest'] !== undefined) {
      if (typeof body['runDigest'] !== 'boolean') {
        throw badRequest('INVALID_PREFERENCE', 'runDigest must be a boolean.');
      }
      updates.runDigest = body['runDigest'];
    }

    if (body['autoOpenFailures'] !== undefined) {
      if (typeof body['autoOpenFailures'] !== 'boolean') {
        throw badRequest('INVALID_PREFERENCE', 'autoOpenFailures must be a boolean.');
      }
      updates.autoOpenFailures = body['autoOpenFailures'];
    }

    if (Object.keys(updates).length === 0) {
      throw badRequest('INVALID_PREFERENCE', 'At least one preference must be provided.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(updates.compactNavigation !== undefined
          ? { prefersCompactNavigation: updates.compactNavigation }
          : {}),
        ...(updates.emailNotifications !== undefined
          ? { prefersEmailNotifications: updates.emailNotifications }
          : {}),
        ...(updates.runDigest !== undefined ? { prefersRunDigest: updates.runDigest } : {}),
        ...(updates.autoOpenFailures !== undefined
          ? { prefersAutoOpenFailures: updates.autoOpenFailures }
          : {}),
      },
      select: {
        prefersCompactNavigation: true,
        prefersEmailNotifications: true,
        prefersRunDigest: true,
        prefersAutoOpenFailures: true,
      },
    });

    return {
      compactNavigation: user.prefersCompactNavigation,
      emailNotifications: user.prefersEmailNotifications,
      runDigest: user.prefersRunDigest,
      autoOpenFailures: user.prefersAutoOpenFailures,
    };
  }
}