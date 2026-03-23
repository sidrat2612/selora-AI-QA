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
  name: string;
  baseUrl: string;
  isDefault: boolean;
  [key: string]: unknown;
};

export const workspaces = {
  listForTenant: (tenantId: string) =>
    requestList<Workspace>(`/tenants/${tenantId}/workspaces`),

  create: (tenantId: string, body: { name: string; slug?: string }) =>
    request<Workspace>(`/tenants/${tenantId}/workspaces`, { method: "POST", body }),

  getDetails: (workspaceId: string) =>
    request<Workspace>(`/workspaces/${workspaceId}`),

  listMemberships: (workspaceId: string) =>
    requestList<Membership>(`/workspaces/${workspaceId}/memberships`),

  createMembership: (workspaceId: string, body: { email: string; role: string }) =>
    request<Membership>(`/workspaces/${workspaceId}/memberships`, { method: "POST", body }),

  updateMembership: (workspaceId: string, membershipId: string, body: { role: string }) =>
    request<Membership>(`/workspaces/${workspaceId}/memberships/${membershipId}`, { method: "PATCH", body }),

  deleteMembership: (workspaceId: string, membershipId: string) =>
    request<void>(`/workspaces/${workspaceId}/memberships/${membershipId}`, { method: "DELETE" }),

  listEnvironments: (workspaceId: string) =>
    requestList<Environment>(`/workspaces/${workspaceId}/environments`),

  createEnvironment: (workspaceId: string, body: { name: string; baseUrl: string }) =>
    request<Environment>(`/workspaces/${workspaceId}/environments`, { method: "POST", body }),

  updateEnvironment: (workspaceId: string, environmentId: string, body: Record<string, unknown>) =>
    request<Environment>(`/workspaces/${workspaceId}/environments/${environmentId}`, { method: "PATCH", body }),
};

// ─── Suites ──────────────────────────────────────────────────────────────────

export type Suite = {
  id: string;
  name: string;
  description?: string;
  status: string;
  testCount?: number;
  lastRunAt?: string;
  lastRunStatus?: string;
  createdAt: string;
  [key: string]: unknown;
};

export const suites = {
  list: (workspaceId: string) =>
    requestList<Suite>(`/workspaces/${workspaceId}/suites`),

  get: (workspaceId: string, suiteId: string) =>
    request<Suite>(`/workspaces/${workspaceId}/suites/${suiteId}`),

  create: (workspaceId: string, body: { name: string; description?: string }) =>
    request<Suite>(`/workspaces/${workspaceId}/suites`, { method: "POST", body }),

  update: (workspaceId: string, suiteId: string, body: Record<string, unknown>) =>
    request<Suite>(`/workspaces/${workspaceId}/suites/${suiteId}`, { method: "PATCH", body }),
};

// ─── Tests / Recordings ─────────────────────────────────────────────────────

export type Test = {
  id: string;
  title: string;
  status: string;
  suiteId?: string;
  suiteName?: string;
  lastRunStatus?: string;
  lastRunAt?: string;
  generatedAt?: string;
  [key: string]: unknown;
};

export type RepairAttempt = {
  id: string;
  testId: string;
  status: string;
  attempt: number;
  createdAt: string;
  [key: string]: unknown;
};

export type Recording = {
  id: string;
  filename: string;
  status: string;
  suiteId?: string;
  createdAt: string;
  [key: string]: unknown;
};

export const tests = {
  list: (workspaceId: string, params?: Record<string, string | undefined>) =>
    requestList<Test>(`/workspaces/${workspaceId}/tests`, { params }),

  get: (workspaceId: string, testId: string) =>
    request<Test>(`/workspaces/${workspaceId}/tests/${testId}`),

  getRepairAttempts: (workspaceId: string, testId: string) =>
    requestList<RepairAttempt>(`/workspaces/${workspaceId}/tests/${testId}/repair-attempts`),

  getRepairAnalytics: (workspaceId: string, params?: Record<string, string | undefined>) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/repair-analytics`, { params }),

  generate: (workspaceId: string, testId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/tests/${testId}/generate`, { method: "POST" }),

  getArtifact: (workspaceId: string, testId: string, artifactId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/tests/${testId}/generated-artifacts/${artifactId}`),

  publishArtifact: (workspaceId: string, testId: string, artifactId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/tests/${testId}/generated-artifacts/${artifactId}/publish`, { method: "POST" }),
};

export const recordings = {
  list: (workspaceId: string, params?: Record<string, string | undefined>) =>
    requestList<Recording>(`/workspaces/${workspaceId}/recordings`, { params }),

  get: (workspaceId: string, recordingId: string) =>
    request<Recording>(`/workspaces/${workspaceId}/recordings/${recordingId}`),

  upload: (workspaceId: string, file: File, suiteId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (suiteId) formData.append("suiteId", suiteId);
    return fetch(`${API_BASE}/workspaces/${workspaceId}/recordings`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new ApiError(res.status, err?.error?.code ?? "UPLOAD_ERROR", err?.error?.message ?? "Upload failed");
      }
      const json = await res.json();
      return (json.data ?? json) as Recording;
    });
  },
};

// ─── Runs ────────────────────────────────────────────────────────────────────

export type Run = {
  id: string;
  suiteId?: string;
  suiteName?: string;
  environmentId?: string;
  environmentName?: string;
  status: string;
  totalTests?: number;
  passedTests?: number;
  failedTests?: number;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  [key: string]: unknown;
};

export type RunItem = {
  id: string;
  testId: string;
  testTitle?: string;
  status: string;
  duration?: number;
  errorMessage?: string;
  [key: string]: unknown;
};

export const runs = {
  list: (workspaceId: string, params?: Record<string, string | undefined>) =>
    requestList<Run>(`/workspaces/${workspaceId}/runs`, { params }),

  get: (workspaceId: string, runId: string) =>
    request<Run>(`/workspaces/${workspaceId}/runs/${runId}`),

  listItems: (workspaceId: string, runId: string) =>
    requestList<RunItem>(`/workspaces/${workspaceId}/runs/${runId}/items`),

  compare: (workspaceId: string, runIdA: string, runIdB: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/runs/compare`, {
      params: { runIdA, runIdB },
    }),

  create: (workspaceId: string, body: { suiteId: string; environmentId: string }) =>
    request<Run>(`/workspaces/${workspaceId}/runs`, { method: "POST", body }),

  cancel: (workspaceId: string, runId: string) =>
    request<Run>(`/workspaces/${workspaceId}/runs/${runId}/cancel`, { method: "POST" }),
};

// ─── Audit ───────────────────────────────────────────────────────────────────

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

// ─── Feedback ────────────────────────────────────────────────────────────────

export type FeedbackItem = {
  id: string;
  category: string;
  title?: string;
  summary: string;
  status: string;
  priority?: string;
  createdAt: string;
  submittedBy?: { id: string; name: string; email: string };
  [key: string]: unknown;
};

export const feedback = {
  list: (workspaceId: string) =>
    request<FeedbackItem[]>(`/workspaces/${workspaceId}/feedback`),

  create: (workspaceId: string, body: { type: string; message: string; title?: string }) =>
    request<FeedbackItem>(`/workspaces/${workspaceId}/feedback`, { method: "POST", body }),

  update: (workspaceId: string, feedbackId: string, body: Record<string, unknown>) =>
    request<FeedbackItem>(`/workspaces/${workspaceId}/feedback/${feedbackId}`, { method: "PATCH", body }),
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
  get: (tenantId: string) => request<Tenant>(`/tenants/${tenantId}`),

  update: (tenantId: string, body: Record<string, unknown>) =>
    request<Tenant>(`/tenants/${tenantId}`, { method: "PATCH", body }),

  export: (tenantId: string) =>
    `${API_BASE}/tenants/${tenantId}/export`,
};

// ─── Usage & Quotas ──────────────────────────────────────────────────────────

export type UsageData = {
  [key: string]: unknown;
};

export type QuotaData = {
  [key: string]: unknown;
};

export const usage = {
  getWorkspaceUsage: (workspaceId: string) =>
    request<UsageData>(`/workspaces/${workspaceId}/usage`),

  getTenantUsage: (tenantId: string) =>
    request<UsageData>(`/tenants/${tenantId}/usage`),
};

export const quotas = {
  get: (tenantId: string) => request<QuotaData>(`/tenants/${tenantId}/quotas`),

  update: (tenantId: string, body: Record<string, unknown>) =>
    request<QuotaData>(`/tenants/${tenantId}/quotas`, { method: "PATCH", body }),
};

// ─── GitHub Integration ──────────────────────────────────────────────────────

export const githubIntegration = {
  upsert: (workspaceId: string, suiteId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration`, {
      method: "PATCH",
      body,
    }),

  validate: (workspaceId: string, suiteId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration/validate`, {
      method: "POST",
    }),

  delete: (workspaceId: string, suiteId: string) =>
    request<void>(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration`, { method: "DELETE" }),
};

// ─── TestRail Integration ────────────────────────────────────────────────────

export const testRailIntegration = {
  upsert: (workspaceId: string, suiteId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/suites/${suiteId}/testrail-integration`, {
      method: "PATCH",
      body,
    }),

  validate: (workspaceId: string, suiteId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/suites/${suiteId}/testrail-integration/validate`, {
      method: "POST",
    }),

  delete: (workspaceId: string, suiteId: string) =>
    request<void>(`/workspaces/${workspaceId}/suites/${suiteId}/testrail-integration`, { method: "DELETE" }),

  sync: (workspaceId: string, suiteId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/suites/${suiteId}/testrail-integration/sync`, {
      method: "POST",
    }),
};
