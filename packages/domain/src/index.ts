// @selora/domain — Shared domain types, enums and value objects

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type EntityId = string;

export const MembershipRole = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  TENANT_OPERATOR: 'TENANT_OPERATOR',
  TENANT_VIEWER: 'TENANT_VIEWER',
  WORKSPACE_OPERATOR: 'WORKSPACE_OPERATOR',
  WORKSPACE_VIEWER: 'WORKSPACE_VIEWER',
} as const;

export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  REVOKED: 'REVOKED',
} as const;

export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const RunStatus = {
  QUEUED: 'QUEUED',
  VALIDATING: 'VALIDATING',
  REPAIRING: 'REPAIRING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  TIMED_OUT: 'TIMED_OUT',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const LicenseTier = {
  EVALUATION: 'evaluation',
  COMMERCIAL: 'commercial',
} as const;

export type LicenseTier = (typeof LicenseTier)[keyof typeof LicenseTier];

export type LicenseStatus = {
  enforcementEnabled: boolean;
  tier: LicenseTier;
  commercialUseAllowed: boolean;
  licensedTo: string | null;
  alertEmailConfigured: boolean;
  protectedFeatures: string[];
};

export function isAdminRole(role: MembershipRole): boolean {
  return role === MembershipRole.PLATFORM_ADMIN || role === MembershipRole.TENANT_ADMIN;
}

export function canManageWorkspace(role: MembershipRole): boolean {
  return (
    isAdminRole(role) ||
    role === MembershipRole.TENANT_OPERATOR ||
    role === MembershipRole.WORKSPACE_OPERATOR
  );
}

export function canViewWorkspace(role: MembershipRole): boolean {
  return (
    canManageWorkspace(role) ||
    role === MembershipRole.TENANT_VIEWER ||
    role === MembershipRole.WORKSPACE_VIEWER
  );
}

// ─── Four-role permission helpers ────────────────────────────────────────────

/**
 * Target four roles:
 *   PLATFORM_ADMIN  → Selora Admin   (console only)
 *   TENANT_ADMIN    → Company Admin   (core app, full governance)
 *   TENANT_OPERATOR → Company Operator(core app, authoring + execution)
 *   TENANT_VIEWER   → Read-only       (core app, view only)
 *
 * WORKSPACE_OPERATOR/WORKSPACE_VIEWER are treated as their tenant-wide
 * equivalents for backward-compat: WS_OPERATOR → TENANT_OPERATOR semantics,
 * WS_VIEWER → TENANT_VIEWER semantics.
 */

export type PermissionFlags = {
  isSeloraAdmin: boolean;
  canManageCompany: boolean;
  canManageMembers: boolean;
  canManageIntegrations: boolean;
  canManageEnvironments: boolean;
  canAuthorAutomation: boolean;
  canOperateRuns: boolean;
  isReadOnly: boolean;
};

export function computePermissions(role: MembershipRole): PermissionFlags {
  // Normalize deprecated workspace-scoped roles to tenant equivalents
  const effective = normalizeRole(role);

  const isSeloraAdmin = effective === MembershipRole.PLATFORM_ADMIN;
  const isCompanyAdmin = effective === MembershipRole.TENANT_ADMIN;
  const isCompanyOperator = effective === MembershipRole.TENANT_OPERATOR;
  const isReadOnly =
    effective === MembershipRole.TENANT_VIEWER && !isSeloraAdmin && !isCompanyAdmin;

  return {
    isSeloraAdmin,
    canManageCompany: isSeloraAdmin || isCompanyAdmin,
    canManageMembers: isCompanyAdmin,
    canManageIntegrations: isSeloraAdmin || isCompanyAdmin,
    canManageEnvironments: isCompanyAdmin,
    canAuthorAutomation: isCompanyAdmin || isCompanyOperator,
    canOperateRuns: isCompanyAdmin || isCompanyOperator,
    isReadOnly,
  };
}

export function normalizeRole(role: MembershipRole): MembershipRole {
  if (role === MembershipRole.WORKSPACE_OPERATOR) return MembershipRole.TENANT_OPERATOR;
  if (role === MembershipRole.WORKSPACE_VIEWER) return MembershipRole.TENANT_VIEWER;
  return role;
}

type EncryptedSecretPayload = {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
};

function getSecretEncryptionKey() {
  const configuredKey =
    process.env['SECRET_ENCRYPTION_KEY'] ??
    process.env['API_SESSION_SECRET'] ??
    'selora-dev-secret-encryption-key';

  return createHash('sha256').update(configuredKey, 'utf8').digest();
}

export function encryptSecretValue(secretValue: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getSecretEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secretValue, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  } satisfies EncryptedSecretPayload);
}

export function decryptSecretValue(encryptedSecretJson: string) {
  const payload = JSON.parse(encryptedSecretJson) as Partial<EncryptedSecretPayload>;
  if (
    payload.version !== 1 ||
    payload.algorithm !== 'aes-256-gcm' ||
    !payload.iv ||
    !payload.tag ||
    !payload.ciphertext
  ) {
    throw new Error('Encrypted secret payload is invalid.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getSecretEncryptionKey(),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
