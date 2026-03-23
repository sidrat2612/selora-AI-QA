// force-rebuild
import {
  MembershipRole,
  MembershipStatus,
  UserStatus,
  type Prisma,
  type User,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Injectable } from '@nestjs/common';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { badRequest, unauthorized } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mail/mailer.service';

// ─── Permission helpers (inlined from @selora/domain) ────────────────────────

type PermissionFlags = {
  isSeloraAdmin: boolean;
  canManageCompany: boolean;
  canManageMembers: boolean;
  canManageIntegrations: boolean;
  canManageEnvironments: boolean;
  canAuthorAutomation: boolean;
  canOperateRuns: boolean;
  isReadOnly: boolean;
};

function computePermissions(role: MembershipRole): PermissionFlags {
  switch (role) {
    case MembershipRole.PLATFORM_ADMIN:
      return { isSeloraAdmin: true, canManageCompany: true, canManageMembers: true, canManageIntegrations: true, canManageEnvironments: true, canAuthorAutomation: true, canOperateRuns: true, isReadOnly: false };
    case MembershipRole.TENANT_ADMIN:
      return { isSeloraAdmin: false, canManageCompany: true, canManageMembers: true, canManageIntegrations: true, canManageEnvironments: true, canAuthorAutomation: true, canOperateRuns: true, isReadOnly: false };
    case MembershipRole.TENANT_OPERATOR:
      return { isSeloraAdmin: false, canManageCompany: false, canManageMembers: false, canManageIntegrations: false, canManageEnvironments: false, canAuthorAutomation: true, canOperateRuns: true, isReadOnly: false };
    case MembershipRole.TENANT_VIEWER:
      return { isSeloraAdmin: false, canManageCompany: false, canManageMembers: false, canManageIntegrations: false, canManageEnvironments: false, canAuthorAutomation: false, canOperateRuns: false, isReadOnly: true };
    default:
      return { isSeloraAdmin: false, canManageCompany: false, canManageMembers: false, canManageIntegrations: false, canManageEnvironments: false, canAuthorAutomation: false, canOperateRuns: false, isReadOnly: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TTL_SECONDS = 60 * 60 * 24;
const SESSION_IDLE_TTL_SECONDS = 60 * 60 * 8;
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const MIN_PASSWORD_LENGTH = 10;

type UserWithMemberships = Prisma.UserGetPayload<{
  include: {
    memberships: {
      include: {
        workspace: true;
      };
    };
  };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  getSessionCookieName() {
    return 'selora_session';
  }

  getSessionCookieOptions() {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000,
    };
  }

  async authenticateRequest(input: {
    sessionToken?: string;
    ipAddress?: string;
    userAgent?: string | string[];
  }): Promise<RequestAuthContext> {
    if (!input.sessionToken) {
      throw unauthorized('SESSION_REQUIRED', 'Authentication is required.');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { sessionTokenHash: this.hashToken(input.sessionToken) },
      include: {
        user: {
          include: {
            memberships: {
              include: { workspace: true },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw unauthorized('SESSION_INVALID', 'Authentication is required.');
    }

    if (
      session.user.status !== UserStatus.ACTIVE ||
      !session.user.emailVerifiedAt ||
      session.user.passwordVersion !== session.passwordVersion
    ) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw unauthorized('SESSION_INVALID', 'Authentication is required.');
    }

    const now = new Date();
    const absoluteExpiry = new Date(session.createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
    const nextExpiry = new Date(
      Math.min(
        absoluteExpiry.getTime(),
        now.getTime() + SESSION_IDLE_TTL_SECONDS * 1000,
      ),
    );

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastActivityAt: now,
        expiresAt: nextExpiry,
        ipAddress: input.ipAddress ?? session.ipAddress,
        userAgent: Array.isArray(input.userAgent)
          ? input.userAgent[0] ?? session.userAgent
          : input.userAgent ?? session.userAgent,
      },
    });

    return this.toAuthContext(session.id, session.activeWorkspaceId, session.user);
  }

  async login(input: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string | string[];
    requestId?: string;
  }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.findUserByEmail(normalizedEmail);

    const invalidCredentials = unauthorized(
      'INVALID_CREDENTIALS',
      'Invalid email or password.',
    );

    if (!user) {
      throw invalidCredentials;
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      await this.auditService.record({
        tenantId: user.memberships[0]?.tenantId ?? 'unknown',
        actorUserId: user.id,
        eventType: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        requestId: input.requestId,
        metadataJson: { reason: 'invalid_credentials' },
      });
      throw invalidCredentials;
    }

    if (!user.emailVerifiedAt || user.status !== UserStatus.ACTIVE) {
      throw unauthorized('EMAIL_NOT_VERIFIED', 'Email verification is required before login.');
    }

    const session = await this.createSession(user, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.record({
      tenantId: user.memberships[0]?.tenantId ?? 'unknown',
      workspaceId: session.auth.activeWorkspaceId,
      actorUserId: user.id,
      eventType: 'auth.login_succeeded',
      entityType: 'user',
      entityId: user.id,
      requestId: input.requestId,
    });

    return session;
  }

  async logout(input: { sessionId: string; actorUserId: string; tenantId: string; requestId?: string }) {
    await this.prisma.userSession.update({
      where: { id: input.sessionId },
      data: { revokedAt: new Date() },
    });

    await this.auditService.record({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      eventType: 'auth.logout',
      entityType: 'session',
      entityId: input.sessionId,
      requestId: input.requestId,
    });
  }

  async getSession(auth: RequestAuthContext) {
    const user = await this.findUserById(auth.user.id);
    if (!user) {
      throw unauthorized('SESSION_INVALID', 'Authentication is required.');
    }

    return this.buildSessionPayload(this.toAuthContext(auth.sessionId, auth.activeWorkspaceId, user));
  }

  async verifyEmail(input: { token: string; requestId?: string }) {
    const tokenHash = this.hashToken(input.token);
    const now = new Date();
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt <= now) {
      throw badRequest('VERIFICATION_TOKEN_INVALID', 'The verification token is invalid or expired.');
    }

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.emailVerificationToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw badRequest('VERIFICATION_TOKEN_INVALID', 'The verification token is invalid or expired.');
      }

      await transaction.user.update({
        where: { id: record.userId },
        data: {
          emailVerifiedAt: now,
          status: UserStatus.ACTIVE,
        },
      });
    });

    const tenantId =
      (
        await this.prisma.membership.findFirst({
          where: { userId: record.userId },
          orderBy: { createdAt: 'asc' },
        })
      )?.tenantId ?? 'unknown';

    await this.auditService.record({
      tenantId,
      actorUserId: record.userId,
      eventType: 'auth.email_verified',
      entityType: 'user',
      entityId: record.userId,
      requestId: input.requestId,
    });

    return { verified: true };
  }

  async forgotPassword(input: { email: string; requestId?: string }) {
    const user = await this.findUserByEmail(input.email.trim().toLowerCase());

    if (!user || !user.emailVerifiedAt) {
      return { submitted: true };
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = this.createOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: this.createExpiryDate(PASSWORD_RESET_TTL_SECONDS),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetRequestedAt: new Date() },
    });

    await this.mailerService.sendPasswordResetEmail(user.email, token);

    await this.auditService.record({
      tenantId: user.memberships[0]?.tenantId ?? 'unknown',
      actorUserId: user.id,
      eventType: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      requestId: input.requestId,
    });

    return { submitted: true };
  }

  async resetPassword(input: { token: string; newPassword: string; requestId?: string }) {
    this.assertPasswordStrength(input.newPassword);

    const tokenHash = this.hashToken(input.token);
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { memberships: true } } },
    });

    if (!record || record.usedAt || record.expiresAt <= now) {
      throw badRequest('RESET_TOKEN_INVALID', 'The password reset token is invalid or expired.');
    }

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw badRequest('RESET_TOKEN_INVALID', 'The password reset token is invalid or expired.');
      }

      await transaction.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await bcrypt.hash(input.newPassword, 12),
          passwordVersion: { increment: 1 },
          status: UserStatus.ACTIVE,
        },
      });

      await transaction.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.auditService.record({
      tenantId: record.user.memberships[0]?.tenantId ?? 'unknown',
      actorUserId: record.userId,
      eventType: 'auth.password_reset_completed',
      entityType: 'user',
      entityId: record.userId,
      requestId: input.requestId,
    });

    return { reset: true };
  }

  async issueVerificationForUser(user: User, requestId?: string) {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = this.createOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: this.createExpiryDate(EMAIL_VERIFICATION_TTL_SECONDS),
      },
    });

    await this.mailerService.sendVerificationEmail(user.email, token);

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });

    if (membership) {
      await this.auditService.record({
        tenantId: membership.tenantId,
        workspaceId: membership.workspaceId,
        actorUserId: user.id,
        eventType: 'auth.verification_email_sent',
        entityType: 'user',
        entityId: user.id,
        requestId,
      });
    }
  }

  async createInvitedUser(input: { email: string; name: string }) {
    return this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: await bcrypt.hash(randomUUID(), 12),
        status: UserStatus.INVITED,
      },
    });
  }

  private async createSession(
    user: UserWithMemberships,
    input: { ipAddress?: string; userAgent?: string | string[] },
  ) {
    const sessionToken = this.createOpaqueToken();
    const activeWorkspaceId =
      user.memberships.find((membership) => membership.status === MembershipStatus.ACTIVE && membership.workspaceId)
        ?.workspaceId ?? null;

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: this.hashToken(sessionToken),
        activeWorkspaceId,
        passwordVersion: user.passwordVersion,
        ipAddress: input.ipAddress,
        userAgent: Array.isArray(input.userAgent) ? input.userAgent[0] : input.userAgent,
        lastActivityAt: new Date(),
        expiresAt: this.createExpiryDate(SESSION_TTL_SECONDS),
      },
    });

    return {
      sessionToken,
      auth: this.toAuthContext(session.id, activeWorkspaceId, user),
    };
  }

  private toAuthContext(
    sessionId: string,
    activeWorkspaceId: string | null,
    user: UserWithMemberships,
  ): RequestAuthContext {
    return {
      sessionId,
      activeWorkspaceId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        passwordVersion: user.passwordVersion,
        memberships: user.memberships.map((membership) => ({
          id: membership.id,
          tenantId: membership.tenantId,
          workspaceId: membership.workspaceId,
          role: membership.role,
          status: membership.status,
          workspaceName: membership.workspace?.name,
          workspaceSlug: membership.workspace?.slug,
        })),
      },
    };
  }

  private buildSessionPayload(auth: RequestAuthContext) {
    const activeMembership =
      auth.user.memberships.find((membership) => membership.workspaceId === auth.activeWorkspaceId) ??
      auth.user.memberships.find((membership) => membership.workspaceId !== null) ??
      null;

    // Compute the effective role: prefer the active membership's role,
    // fall back to the highest tenant-level role the user has.
    const effectiveRole: MembershipRole | undefined = activeMembership
      ? activeMembership.role
      : (auth.user.memberships[0]?.role
          ? auth.user.memberships[0].role
          : undefined);

    const permissions = effectiveRole ? computePermissions(effectiveRole) : null;

    return {
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        status: auth.user.status,
        emailVerifiedAt: auth.user.emailVerifiedAt,
        memberships: auth.user.memberships,
      },
      permissions,
      activeWorkspace: activeMembership
        ? {
            id: activeMembership.workspaceId,
            name: activeMembership.workspaceName,
            slug: activeMembership.workspaceSlug,
            tenantId: activeMembership.tenantId,
          }
        : null,
    };
  }

  private async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { workspace: true },
        },
      },
    });
  }

  private async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { workspace: true },
        },
      },
    });
  }

  private createOpaqueToken() {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private createExpiryDate(ttlSeconds: number) {
    return new Date(Date.now() + ttlSeconds * 1000);
  }

  private assertPasswordStrength(password: string) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw badRequest(
        'PASSWORD_TOO_WEAK',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      );
    }
  }
}
