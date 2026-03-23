import {
  EnvironmentStatus,
  MembershipRole,
  MembershipStatus,
  type Environment,
  type Membership,
  type RetentionSetting,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { isTenantWideRole } from '../auth/membership-role.utils';
import { QuotaService } from '../usage/quota.service';
import { encryptSecretValue } from '../common/secret-crypto';
import { ensureDefaultSuite } from '../suites/suite-defaults';

const environmentPublicSelect = {
  id: true,
  workspaceId: true,
  name: true,
  baseUrl: true,
  secretRef: true,
  isDefault: true,
  status: true,
  testTimeoutMs: true,
  runTimeoutMs: true,
  maxRetries: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly quotaService: QuotaService,
  ) {}

  async listTenantWorkspaces(tenantId: string, auth: RequestAuthContext) {
    const tenantWideAccess = auth.user.memberships.some(
      (membership) =>
        membership.tenantId === tenantId &&
        membership.status === MembershipStatus.ACTIVE &&
        isTenantWideRole(membership.role),
    );

    const platformAccess = auth.user.memberships.some(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE && membership.role === MembershipRole.PLATFORM_ADMIN,
    );

    const workspaces = await this.prisma.workspace.findMany({
      where: platformAccess || tenantWideAccess
        ? { tenantId }
        : {
            tenantId,
            memberships: {
              some: {
                userId: auth.user.id,
                status: MembershipStatus.ACTIVE,
              },
            },
          },
      orderBy: { createdAt: 'asc' },
    });

    return workspaces;
  }

  async createWorkspace(
    tenantId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    requestId: string,
  ) {
    const name = this.readNonEmptyString(body['name'], 'name');
    const slug = this.readSlug(body['slug']);

    const existing = await this.prisma.workspace.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
    });
    if (existing) {
      throw conflict('WORKSPACE_SLUG_EXISTS', 'Workspace slug already exists for this tenant.');
    }

    const workspace = await this.prisma.$transaction(async (transaction) => {
      const createdWorkspace = await transaction.workspace.create({
        data: {
          tenantId,
          name,
          slug,
        },
      });

      await transaction.retentionSetting.create({
        data: { workspaceId: createdWorkspace.id },
      });

      await transaction.membership.create({
        data: {
          tenantId,
          workspaceId: createdWorkspace.id,
          userId: auth.user.id,
          role: MembershipRole.TENANT_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      });

      await ensureDefaultSuite(transaction, {
        tenantId,
        workspaceId: createdWorkspace.id,
        workspaceName: createdWorkspace.name,
      });

      return createdWorkspace;
    });

    await this.auditService.record({
      tenantId,
      workspaceId: workspace.id,
      actorUserId: auth.user.id,
      eventType: 'workspace.created',
      entityType: 'workspace',
      entityId: workspace.id,
      requestId,
      metadataJson: { slug: workspace.slug },
    });

    return workspace;
  }

  async getWorkspaceDetails(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        environments: {
          select: environmentPublicSelect,
        },
        retentionSetting: true,
      },
    });

    if (!workspace) {
      throw notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.');
    }

    return workspace;
  }

  async listMemberships(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { tenantId: true },
    });

    if (!workspace) {
      throw notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.');
    }

    return this.prisma.membership.findMany({
      where: {
        tenantId: workspace.tenantId,
        status: { not: MembershipStatus.REVOKED },
        OR: [
          { workspaceId },
          { role: { in: [MembershipRole.TENANT_ADMIN, MembershipRole.TENANT_OPERATOR, MembershipRole.TENANT_VIEWER] } },
        ],
      },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMembership(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const role = this.readRole(body['role']);
    this.assertMembershipRoleAssignable(auth, tenantId, workspaceId, role);

    const userId = typeof body['userId'] === 'string' ? body['userId'] : undefined;
    const email = typeof body['email'] === 'string' ? body['email'].trim().toLowerCase() : undefined;
    const name = typeof body['name'] === 'string' ? body['name'].trim() : undefined;

    let user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : email
        ? await this.prisma.user.findUnique({ where: { email } })
        : null;

    if (!user && (!email || !name)) {
      throw badRequest(
        'MEMBERSHIP_USER_REQUIRED',
        'Provide either userId or both email and name to create a membership.',
      );
    }

    if (!user && email && name) {
      user = await this.authService.createInvitedUser({ email, name });
      await this.authService.issueVerificationForUser(user, requestId);
    }

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'User was not found.');
    }

    const duplicate = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId: user.id,
        status: { not: MembershipStatus.REVOKED },
        ...(isTenantWideRole(role)
          ? {
              role: {
                in: [MembershipRole.TENANT_ADMIN, MembershipRole.TENANT_OPERATOR, MembershipRole.TENANT_VIEWER],
              },
            }
          : { workspaceId }),
      },
    });

    if (duplicate) {
      throw conflict('MEMBERSHIP_EXISTS', 'A membership already exists for this user in the target access scope.');
    }

    await this.quotaService.assertSeatAvailable(tenantId, user.id);

    const membership = await this.prisma.membership.create({
      data: {
        tenantId,
        workspaceId,
        userId: user.id,
        role,
        status: user.emailVerifiedAt ? MembershipStatus.ACTIVE : MembershipStatus.INVITED,
      },
      include: { user: true },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'membership.created',
      entityType: 'membership',
      entityId: membership.id,
      requestId,
      metadataJson: { role: membership.role, userId: membership.userId },
    });

    return membership;
  }

  async updateMembership(
    workspaceId: string,
    membershipId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: true },
    });

    if (!membership) {
      throw notFound('MEMBERSHIP_NOT_FOUND', 'Membership was not found.');
    }

    const role = this.readRole(body['role']);
    const duplicate = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId: membership.userId,
        status: { not: MembershipStatus.REVOKED },
        NOT: { id: membershipId },
        ...(isTenantWideRole(role)
          ? {
              role: {
                in: [MembershipRole.TENANT_ADMIN, MembershipRole.TENANT_OPERATOR, MembershipRole.TENANT_VIEWER],
              },
            }
          : { workspaceId: membership.workspaceId }),
      },
    });

    if (duplicate) {
      throw conflict('MEMBERSHIP_EXISTS', 'A membership already exists for this user in the target access scope.');
    }

    this.assertMembershipRoleAssignable(auth, tenantId, workspaceId, role, membership);
    await this.ensureNotRemovingLastAdmin(auth, tenantId, membership, role);

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role },
      include: { user: true },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'membership.updated',
      entityType: 'membership',
      entityId: membershipId,
      requestId,
      metadataJson: { role },
    });

    return updated;
  }

  async deleteMembership(
    workspaceId: string,
    membershipId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
    });

    if (!membership) {
      throw notFound('MEMBERSHIP_NOT_FOUND', 'Membership was not found.');
    }

    await this.ensureNotRemovingLastAdmin(auth, tenantId, membership, null);

    await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.REVOKED },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'membership.revoked',
      entityType: 'membership',
      entityId: membershipId,
      requestId,
    });

    return { revoked: true };
  }

  async listEnvironments(workspaceId: string) {
    return this.prisma.environment.findMany({
      where: { workspaceId },
      select: environmentPublicSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createEnvironment(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const input = this.readRequiredEnvironmentBody(body);
    const environment = await this.prisma.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.environment.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return transaction.environment.create({
        data: {
          workspaceId,
          name: input.name,
          baseUrl: input.baseUrl,
          secretRef: input.secretRef,
          encryptedSecretJson: input.secretValue ? encryptSecretValue(input.secretValue) : null,
          isDefault: input.isDefault,
          testTimeoutMs: input.testTimeoutMs,
          runTimeoutMs: input.runTimeoutMs,
          maxRetries: input.maxRetries,
        },
        select: environmentPublicSelect,
      });
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'environment.created',
      entityType: 'environment',
      entityId: environment.id,
      requestId,
      metadataJson: {
        isDefault: environment.isDefault,
        secretSource: input.secretValue ? 'encrypted_store' : 'external_ref',
      },
    });

    return environment;
  }

  async updateEnvironment(
    workspaceId: string,
    environmentId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const current = await this.prisma.environment.findFirst({
      where: { id: environmentId, workspaceId },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        secretRef: true,
        encryptedSecretJson: true,
        isDefault: true,
        status: true,
        testTimeoutMs: true,
        runTimeoutMs: true,
        maxRetries: true,
      },
    });
    if (!current) {
      throw notFound('ENVIRONMENT_NOT_FOUND', 'Environment was not found.');
    }

    const input = this.readEnvironmentBody(body, true);
    const environment = await this.prisma.$transaction(async (transaction) => {
      if (input.isDefault === true) {
        await transaction.environment.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return transaction.environment.update({
        where: { id: environmentId },
        data: {
          name: input.name ?? current.name,
          baseUrl: input.baseUrl ?? current.baseUrl,
          secretRef: input.secretRef ?? current.secretRef,
          encryptedSecretJson: input.secretValue
            ? encryptSecretValue(input.secretValue)
            : current.encryptedSecretJson,
          isDefault: input.isDefault ?? current.isDefault,
          status: input.status ?? current.status,
          testTimeoutMs: input.testTimeoutMs ?? current.testTimeoutMs,
          runTimeoutMs: input.runTimeoutMs ?? current.runTimeoutMs,
          maxRetries: input.maxRetries ?? current.maxRetries,
        },
        select: environmentPublicSelect,
      });
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: input.secretValue ? 'environment.secret_rotated' : 'environment.updated',
      entityType: 'environment',
      entityId: environment.id,
      requestId,
      metadataJson: {
        isDefault: environment.isDefault,
        secretRotated: Boolean(input.secretValue),
      },
    });

    return environment;
  }

  async cloneEnvironment(
    workspaceId: string,
    environmentId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const source = await this.prisma.environment.findFirst({
      where: { id: environmentId, workspaceId },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        testTimeoutMs: true,
        runTimeoutMs: true,
        maxRetries: true,
      },
    });

    if (!source) {
      throw notFound('ENVIRONMENT_NOT_FOUND', 'Source environment was not found.');
    }

    const name = this.readNonEmptyString(body['name'], 'name');
    const secretRef = this.readNonEmptyString(body['secretRef'], 'secretRef');
    const secretValue = this.readOptionalSecretValue(body['secretValue']);

    const cloned = await this.prisma.environment.create({
      data: {
        workspaceId,
        name,
        baseUrl: source.baseUrl,
        secretRef,
        encryptedSecretJson: secretValue ? encryptSecretValue(secretValue) : null,
        isDefault: false,
        status: 'ACTIVE',
        testTimeoutMs: source.testTimeoutMs,
        runTimeoutMs: source.runTimeoutMs,
        maxRetries: source.maxRetries,
      },
      select: environmentPublicSelect,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'environment.cloned',
      entityType: 'environment',
      entityId: cloned.id,
      requestId,
      metadataJson: {
        sourceEnvironmentId: source.id,
        sourceEnvironmentName: source.name,
        secretSource: secretValue ? 'encrypted_store' : 'external_ref',
      },
    });

    return cloned;
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const concurrentExecutionLimit = this.readOptionalPositiveInt(
      body['concurrentExecutionLimit'],
      'concurrentExecutionLimit',
    );
    const maxTestsPerRun = this.readOptionalPositiveInt(body['maxTestsPerRun'], 'maxTestsPerRun');
    const runCooldownSeconds = this.readOptionalNonNegativeInt(
      body['runCooldownSeconds'],
      'runCooldownSeconds',
    );

    if (
      concurrentExecutionLimit === undefined &&
      maxTestsPerRun === undefined &&
      runCooldownSeconds === undefined
    ) {
      throw badRequest(
        'WORKSPACE_SETTINGS_INVALID',
        'Provide at least one workspace execution setting to update.',
      );
    }

    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(concurrentExecutionLimit !== undefined ? { concurrentExecutionLimit } : {}),
        ...(maxTestsPerRun !== undefined ? { maxTestsPerRun } : {}),
        ...(runCooldownSeconds !== undefined ? { runCooldownSeconds } : {}),
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'workspace.settings_updated',
      entityType: 'workspace',
      entityId: workspaceId,
      requestId,
      metadataJson: {
        concurrentExecutionLimit: workspace.concurrentExecutionLimit,
        maxTestsPerRun: workspace.maxTestsPerRun,
        runCooldownSeconds: workspace.runCooldownSeconds,
      },
    });

    return workspace;
  }

  async getRetention(workspaceId: string) {
    return this.ensureRetentionSetting(workspaceId);
  }

  async updateRetention(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const current = await this.ensureRetentionSetting(workspaceId);
    const next = this.readRetentionBody(body);

    const retention = await this.prisma.retentionSetting.update({
      where: { workspaceId },
      data: {
        logsDays: next.logsDays ?? current.logsDays,
        screenshotsDays: next.screenshotsDays ?? current.screenshotsDays,
        videosDays: next.videosDays ?? current.videosDays,
        tracesDays: next.tracesDays ?? current.tracesDays,
        auditDays: next.auditDays ?? current.auditDays,
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'retention.updated',
      entityType: 'retention_setting',
      entityId: retention.id,
      requestId,
    });

    return retention;
  }

  private async ensureRetentionSetting(workspaceId: string): Promise<RetentionSetting> {
    const existing = await this.prisma.retentionSetting.findUnique({ where: { workspaceId } });
    if (existing) {
      return existing;
    }

    return this.prisma.retentionSetting.create({ data: { workspaceId } });
  }

  private async ensureNotRemovingLastAdmin(
    auth: RequestAuthContext,
    tenantId: string,
    membership: Membership,
    nextRole: MembershipRole | null,
  ) {
    const isSelf = membership.userId === auth.user.id;
    const wasAdmin =
      membership.role === MembershipRole.PLATFORM_ADMIN || membership.role === MembershipRole.TENANT_ADMIN;
    const remainsAdmin =
      nextRole === MembershipRole.PLATFORM_ADMIN || nextRole === MembershipRole.TENANT_ADMIN;

    if (!isSelf || !wasAdmin || remainsAdmin) {
      return;
    }

    const adminMemberships = await this.prisma.membership.count({
      where: {
        tenantId,
        userId: auth.user.id,
        status: MembershipStatus.ACTIVE,
        role: { in: [MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_ADMIN] },
        NOT: { id: membership.id },
      },
    });

    if (adminMemberships === 0) {
      throw forbidden(
        'LAST_ADMIN_MEMBERSHIP',
        'You cannot remove or downgrade your own last admin membership.',
      );
    }
  }

  private assertMembershipRoleAssignable(
    auth: RequestAuthContext,
    tenantId: string,
    workspaceId: string,
    nextRole: MembershipRole,
    existingMembership?: Membership,
  ) {
    const actorRole = this.getMembershipManagementRole(auth, tenantId, workspaceId);

    if (
      actorRole === MembershipRole.TENANT_OPERATOR ||
      actorRole === MembershipRole.WORKSPACE_OPERATOR
    ) {
      const assignsWorkspaceRole =
        nextRole === MembershipRole.TENANT_OPERATOR ||
        nextRole === MembershipRole.TENANT_VIEWER ||
        nextRole === MembershipRole.WORKSPACE_OPERATOR ||
        nextRole === MembershipRole.WORKSPACE_VIEWER;
      if (!assignsWorkspaceRole) {
        throw forbidden(
          'ROLE_ASSIGNMENT_FORBIDDEN',
          'Operators can only assign non-admin workspace access roles.',
        );
      }

      if (
        existingMembership &&
        (existingMembership.role === MembershipRole.PLATFORM_ADMIN ||
          existingMembership.role === MembershipRole.TENANT_ADMIN)
      ) {
        throw forbidden(
          'ROLE_ASSIGNMENT_FORBIDDEN',
          'Workspace operators cannot modify elevated memberships.',
        );
      }
    }

    if (actorRole === MembershipRole.TENANT_ADMIN && nextRole === MembershipRole.PLATFORM_ADMIN) {
      throw forbidden(
        'ROLE_ASSIGNMENT_FORBIDDEN',
        'Tenant admins cannot assign platform admin access.',
      );
    }
  }

  private getMembershipManagementRole(
    auth: RequestAuthContext,
    tenantId: string,
    workspaceId: string,
  ): MembershipRole {
    const activeMemberships = auth.user.memberships.filter(
      (membership) => membership.status === MembershipStatus.ACTIVE,
    );

    if (activeMemberships.some((membership) => membership.role === MembershipRole.PLATFORM_ADMIN)) {
      return MembershipRole.PLATFORM_ADMIN;
    }

    if (
      activeMemberships.some(
        (membership) =>
          membership.tenantId === tenantId && membership.role === MembershipRole.TENANT_ADMIN,
      )
    ) {
      return MembershipRole.TENANT_ADMIN;
    }

    if (
      activeMemberships.some(
        (membership) =>
          membership.tenantId === tenantId && membership.role === MembershipRole.TENANT_OPERATOR,
      )
    ) {
      return MembershipRole.TENANT_OPERATOR;
    }

    if (
      activeMemberships.some(
        (membership) =>
          membership.workspaceId === workspaceId && membership.role === MembershipRole.WORKSPACE_OPERATOR,
      )
    ) {
      return MembershipRole.WORKSPACE_OPERATOR;
    }

    throw forbidden('ROLE_ASSIGNMENT_FORBIDDEN', 'You do not have permission to manage memberships.');
  }

  private readNonEmptyString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('VALIDATION_ERROR', `${fieldName} is required.`);
    }

    return value.trim();
  }

  private readSlug(value: unknown) {
    const slug = this.readNonEmptyString(value, 'slug').toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw badRequest('VALIDATION_ERROR', 'slug must contain only lowercase letters, numbers, and hyphens.');
    }
    return slug;
  }

  private readRole(value: unknown): MembershipRole {
    if (typeof value !== 'string' || !(value in MembershipRole)) {
      throw badRequest('VALIDATION_ERROR', 'role is invalid.');
    }

    return MembershipRole[value as keyof typeof MembershipRole];
  }

  private readRequiredEnvironmentBody(body: Record<string, unknown>) {
    const input = this.readEnvironmentBody(body, false);

    if (!input.name || !input.baseUrl || !input.secretRef) {
      throw badRequest('VALIDATION_ERROR', 'name, baseUrl, and secretRef are required.');
    }

    return {
      name: input.name,
      baseUrl: input.baseUrl,
      secretRef: input.secretRef,
      isDefault: input.isDefault ?? false,
      status: input.status,
      secretValue: input.secretValue,
      testTimeoutMs: input.testTimeoutMs,
      runTimeoutMs: input.runTimeoutMs,
      maxRetries: input.maxRetries,
    };
  }

  private readEnvironmentBody(body: Record<string, unknown>, partial = false) {
    const name = typeof body['name'] === 'string' ? body['name'].trim() : undefined;
    const baseUrl = typeof body['baseUrl'] === 'string' ? body['baseUrl'].trim() : undefined;
    const secretRef = typeof body['secretRef'] === 'string' ? body['secretRef'].trim() : undefined;
    const secretValue = this.readOptionalSecretValue(body['secretValue']);
    const isDefault = typeof body['isDefault'] === 'boolean' ? body['isDefault'] : undefined;
    const status = body['status'];
    const testTimeoutMs = this.readOptionalPositiveInt(body['testTimeoutMs'], 'testTimeoutMs');
    const runTimeoutMs = this.readOptionalPositiveInt(body['runTimeoutMs'], 'runTimeoutMs');
    const maxRetries = this.readOptionalNonNegativeInt(body['maxRetries'], 'maxRetries');

    const parsedStatus =
      typeof status === 'string' && status in EnvironmentStatus
        ? EnvironmentStatus[status as keyof typeof EnvironmentStatus]
        : undefined;

    if (!partial) {
      if (!name || !baseUrl || !secretRef) {
        throw badRequest('VALIDATION_ERROR', 'name, baseUrl, and secretRef are required.');
      }

      return {
        name,
        baseUrl,
        secretRef,
        secretValue,
        isDefault: isDefault ?? false,
        status: parsedStatus,
        testTimeoutMs,
        runTimeoutMs,
        maxRetries,
      };
    }

    return {
      name,
      baseUrl,
      secretRef,
      secretValue,
      isDefault,
      status: parsedStatus,
      testTimeoutMs,
      runTimeoutMs,
      maxRetries,
    };
  }

  private readRetentionBody(body: Record<string, unknown>) {
    return {
      logsDays: this.readOptionalPositiveInt(body['logsDays'], 'logsDays'),
      screenshotsDays: this.readOptionalPositiveInt(body['screenshotsDays'], 'screenshotsDays'),
      videosDays: this.readOptionalPositiveInt(body['videosDays'], 'videosDays'),
      tracesDays: this.readOptionalPositiveInt(body['tracesDays'], 'tracesDays'),
      auditDays: this.readOptionalPositiveInt(body['auditDays'], 'auditDays'),
    };
  }

  private readOptionalPositiveInt(value: unknown, fieldName: string) {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw badRequest('VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
    }

    return value;
  }

  private readOptionalNonNegativeInt(value: unknown, fieldName: string) {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw badRequest('VALIDATION_ERROR', `${fieldName} must be a non-negative integer.`);
    }

    return value;
  }

  private readOptionalSecretValue(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value !== 'string' || value.trim().length < 2) {
      throw badRequest('VALIDATION_ERROR', 'secretValue must be at least 2 characters when provided.');
    }

    return value.trim();
  }
}