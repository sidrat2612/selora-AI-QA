import type { LicenseStatus } from "@selora/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, ...init } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorPayload: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {};
    try {
      errorPayload = await response.json();
    } catch {
      // non-JSON error
    }
    const err = errorPayload.error;
    throw new ApiError(
      response.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? response.statusText,
      err?.details ?? {},
    );
  }

  if (response.status === 204) return undefined as T;

  const json = await response.json();
  // API wraps responses in { data, meta }
  return json.data !== undefined ? json.data : json;
}

type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
};

// Helper: unwrap paginated responses to just the items array
async function requestList<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
  const result = await request<PaginatedResponse<T> | T[]>(path, options);
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'items' in result) return result.items;
  return [];
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AuthMembership = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  role: string;
  status: string;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  emailVerifiedAt: string | null;
  memberships: AuthMembership[];
};

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

export type SessionData = {
  user: AuthUser;
  permissions: PermissionFlags | null;
  activeWorkspace: {
    id: string | null;
    name: string | null;
    slug: string | null;
    tenantId: string;
  } | null;
};

export const auth = {
  login: (email: string, password: string) =>
    request<SessionData>("/auth/login", { method: "POST", body: { email, password } }),

  logout: () => request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),

  getSession: () => request<SessionData>("/auth/session"),

  verifyEmail: (token: string) =>
    request<{ verified: boolean }>("/auth/verify-email", { method: "POST", body: { token } }),

  forgotPassword: (email: string) =>
    request<{ sent: boolean }>("/auth/forgot-password", { method: "POST", body: { email } }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ reset: boolean }>("/auth/reset-password", { method: "POST", body: { token, newPassword } }),
};

// ─── Workspaces ──────────────────────────────────────────────────────────────

export type Workspace = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  concurrentExecutionLimit?: number;
  maxTestsPerRun?: number;
  runCooldownSeconds?: number;
  [key: string]: unknown;
};

export type RetentionSettings = {
  workspaceId: string;
  logsDays: number;
  screenshotsDays: number;
  videosDays: number;
  tracesDays: number;
  auditDays: number;
  [key: string]: unknown;
};

export type Membership = {
  id: string;
  userId: string;
  role: string;
  status: string;
  user?: { id: string; email: string; name: string };
  [key: string]: unknown;
};

export type Environment = {
  id: string;
  workspaceId?: string;
  name: string;
  baseUrl: string;
  secretRef?: string;
  isDefault: boolean;
  status?: string;
  testTimeoutMs?: number;
  runTimeoutMs?: number;
  maxRetries?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export const workspaces = {
  listForTenant: (tenantId: string) =>
    requestList<Workspace>(`/tenants/${tenantId}/workspaces`),

  create: (tenantId: string, body: { name: string; slug?: string }) =>
    request<Workspace>(`/tenants/${tenantId}/workspaces`, { method: "POST", body }),

  getDetails: (workspaceId: string) =>
    request<Workspace>(`/workspaces/${workspaceId}`),

  updateSettings: (
    workspaceId: string,
    body: {
      concurrentExecutionLimit?: number;
      maxTestsPerRun?: number;
      runCooldownSeconds?: number;
    },
  ) => request<Workspace>(`/workspaces/${workspaceId}/settings`, { method: "PATCH", body }),

  getRetention: (workspaceId: string) =>
    request<RetentionSettings>(`/workspaces/${workspaceId}/settings/retention`),

  updateRetention: (
    workspaceId: string,
    body: Partial<Pick<RetentionSettings, "logsDays" | "screenshotsDays" | "videosDays" | "tracesDays" | "auditDays">>,
  ) => request<RetentionSettings>(`/workspaces/${workspaceId}/settings/retention`, { method: "PATCH", body }),

  listMemberships: (workspaceId: string) =>
    requestList<Membership>(`/workspaces/${workspaceId}/memberships`),

  createMembership: (workspaceId: string, body: { name: string; email: string; role: string }) =>
    request<Membership>(`/workspaces/${workspaceId}/memberships`, { method: "POST", body }),

  updateMembership: (workspaceId: string, membershipId: string, body: { role: string }) =>
    request<Membership>(`/workspaces/${workspaceId}/memberships/${membershipId}`, { method: "PATCH", body }),

  deleteMembership: (workspaceId: string, membershipId: string) =>
    request<void>(`/workspaces/${workspaceId}/memberships/${membershipId}`, { method: "DELETE" }),

  resendMembershipInvite: (workspaceId: string, membershipId: string) =>
    request<{ resent: true }>(`/workspaces/${workspaceId}/memberships/${membershipId}/resend-invite`, { method: "POST" }),

  listEnvironments: (workspaceId: string) =>
    requestList<Environment>(`/workspaces/${workspaceId}/environments`),

  createEnvironment: (
    workspaceId: string,
    body: {
      name: string;
      baseUrl: string;
      secretRef: string;
      secretValue?: string;
      isDefault?: boolean;
      testTimeoutMs?: number;
      runTimeoutMs?: number;
      maxRetries?: number;
    },
  ) =>
    request<Environment>(`/workspaces/${workspaceId}/environments`, { method: "POST", body }),

  updateEnvironment: (workspaceId: string, environmentId: string, body: Record<string, unknown>) =>
    request<Environment>(`/workspaces/${workspaceId}/environments/${environmentId}`, { method: "PATCH", body }),

  updateLifecycle: (workspaceId: string, body: { status: string }) =>
    request<Workspace>(`/workspaces/${workspaceId}/lifecycle`, { method: "PATCH", body }),

  delete: (workspaceId: string) =>
    request<{ deleted: true }>(`/workspaces/${workspaceId}`, { method: "DELETE" }),
};

// ─── Tenants ─────────────────────────────────────────────────────────────────

export type AuditEvent = {
  id: string;
  eventType: string;
  actorUserId?: string;
  actor?: { id: string; email: string; name: string };
  entityId?: string;
  entityType?: string;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
  [key: string]: unknown;
};

export const audit = {
  list: (workspaceId: string, params?: Record<string, string | undefined>) =>
    requestList<AuditEvent>(`/workspaces/${workspaceId}/audit-events`, { params }),

  getEventTypes: (workspaceId: string) =>
    request<string[]>(`/workspaces/${workspaceId}/audit-events/event-types`),

  export: (workspaceId: string, params?: Record<string, string | undefined>) =>
    `${API_BASE}/workspaces/${workspaceId}/audit-events/export${params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : ""}`,
};

// ─── Tenants ─────────────────────────────────────────────────────────────────

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan?: string;
  createdAt: string;
  [key: string]: unknown;
};

export const tenants = {
  create: (body: { name: string; slug?: string; workspaceName?: string; workspaceSlug?: string }) =>
    request<Tenant>(`/tenants`, { method: "POST", body }),

  get: (tenantId: string) => request<Tenant>(`/tenants/${tenantId}`),

  update: (tenantId: string, body: Record<string, unknown>) =>
    request<Tenant>(`/tenants/${tenantId}`, { method: "PATCH", body }),

  export: (tenantId: string) =>
    `${API_BASE}/tenants/${tenantId}/export`,
};

export const license = {
  getStatus: () => request<LicenseStatus>("/license/status"),
};

// ─── Usage & Quotas ──────────────────────────────────────────────────────────

export type QuotaData = {
  [key: string]: unknown;
};

export const quotas = {
  get: (tenantId: string) => request<QuotaData>(`/tenants/${tenantId}/quotas`),

  update: (tenantId: string, body: Record<string, unknown>) =>
    request<QuotaData>(`/tenants/${tenantId}/quotas`, { method: "PATCH", body }),
};

