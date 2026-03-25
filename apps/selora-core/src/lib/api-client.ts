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
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: string | null;
  preferences: AccountPreferences;
  memberships: AuthMembership[];
};

export type AccountProfile = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: string | null;
  memberships: AuthMembership[];
};

export type AccountPreferences = {
  compactNavigation: boolean;
  emailNotifications: boolean;
  runDigest: boolean;
  autoOpenFailures: boolean;
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

export const account = {
  getProfile: () => request<AccountProfile>("/account/profile"),
  updateProfile: (body: Pick<AccountProfile, "name" | "avatarUrl">) =>
    request<AccountProfile>("/account/profile", { method: "PATCH", body }),
  getPreferences: () => request<AccountPreferences>("/account/preferences"),
  updatePreferences: (body: Partial<AccountPreferences>) =>
    request<AccountPreferences>("/account/preferences", { method: "PATCH", body }),
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

  delete: (workspaceId: string, suiteId: string) =>
    request<Suite>(`/workspaces/${workspaceId}/suites/${suiteId}`, { method: "DELETE" }),

  assignTests: (workspaceId: string, suiteId: string, testIds: string[]) =>
    request<{ assignedCount: number }>(`/workspaces/${workspaceId}/suites/${suiteId}/assign-tests`, {
      method: "POST",
      body: { testIds },
    }),

  unassignTests: (workspaceId: string, suiteId: string, testIds: string[]) =>
    request<{ unassignedCount: number }>(`/workspaces/${workspaceId}/suites/${suiteId}/unassign-tests`, {
      method: "POST",
      body: { testIds },
    }),
};

// ─── Tests / Recordings ─────────────────────────────────────────────────────

export type Test = {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  tags?: string[];
  suiteId?: string;
  suiteName?: string;
  lastRunStatus?: string;
  lastRunAt?: string;
  generatedAt?: string;
  publicationStatus?: string | null;
  publicationBranch?: string | null;
  publicationPrUrl?: string | null;
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

  update: (workspaceId: string, testId: string, body: Record<string, unknown>) =>
    request<Test>(`/workspaces/${workspaceId}/tests/${testId}`, { method: "PATCH", body }),

  getArtifact: (workspaceId: string, testId: string, artifactId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/tests/${testId}/generated-artifacts/${artifactId}`),

  publishArtifact: (workspaceId: string, testId: string, artifactId: string) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/tests/${testId}/generated-artifacts/${artifactId}/publish`, { method: "POST" }),
};

// ─── Business Test Cases ────────────────────────────────────────────────────

export type BusinessTestCase = {
  id: string;
  workspaceId: string;
  suiteId: string;
  title: string;
  description?: string | null;
  format: "SIMPLE" | "STRUCTURED";
  source: "MANUAL" | "TESTRAIL_IMPORT";
  status: "ACTIVE" | "ARCHIVED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  preconditions?: string | null;
  steps?: unknown[] | null;
  expectedResult?: string | null;
  tags?: string[];
  mappedScriptCount?: number;
  mappedScripts?: {
    mappingId: string;
    canonicalTestId: string;
    name: string;
    status: string;
  }[];
  externalLinks?: {
    id: string;
    externalCaseId: string;
    status: string;
    title?: string | null;
    lastSyncedAt?: string | null;
  }[];
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type ScriptMapping = {
  id: string;
  businessTestCaseId: string;
  canonicalTestId: string;
  scriptName: string;
  scriptStatus?: string;
  createdAt: string;
  [key: string]: unknown;
};

export const testCases = {
  list: (workspaceId: string, suiteId: string) =>
    request<BusinessTestCase[]>(`/workspaces/${workspaceId}/suites/${suiteId}/test-cases`),

  get: (workspaceId: string, suiteId: string, testCaseId: string) =>
    request<BusinessTestCase>(`/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`),

  create: (
    workspaceId: string,
    suiteId: string,
    body: {
      title: string;
      description?: string;
      format?: "SIMPLE" | "STRUCTURED";
      priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      preconditions?: string;
      steps?: unknown[];
      expectedResult?: string;
      tags?: string[];
    },
  ) =>
    request<BusinessTestCase>(`/workspaces/${workspaceId}/suites/${suiteId}/test-cases`, {
      method: "POST",
      body,
    }),

  update: (
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    body: Record<string, unknown>,
  ) =>
    request<BusinessTestCase>(
      `/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`,
      { method: "PATCH", body },
    ),

  delete: (workspaceId: string, suiteId: string, testCaseId: string) =>
    request<BusinessTestCase>(
      `/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`,
      { method: "DELETE" },
    ),

  listMappings: (workspaceId: string, suiteId: string, testCaseId: string) =>
    request<ScriptMapping[]>(
      `/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}/mappings`,
    ),

  addMapping: (
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    body: { canonicalTestId: string },
  ) =>
    request<ScriptMapping>(
      `/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}/mappings`,
      { method: "POST", body },
    ),

  removeMapping: (
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    mappingId: string,
  ) =>
    request<{ deleted: true }>(
      `/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}/mappings/${mappingId}`,
      { method: "DELETE" },
    ),
};

export const recordings = {
  list: (workspaceId: string, params?: Record<string, string | undefined>) =>
    requestList<Recording>(`/workspaces/${workspaceId}/recordings`, { params }),

  get: (workspaceId: string, recordingId: string) =>
    request<Recording>(`/workspaces/${workspaceId}/recordings/${recordingId}`),

  upload: (workspaceId: string, file: File, suiteId?: string, canonicalTestId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (suiteId) formData.append("suiteId", suiteId);
    if (canonicalTestId) formData.append("canonicalTestId", canonicalTestId);
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
  resolvedSourceMode?: string;
  resolvedGitRef?: string;
  resolvedCommitSha?: string;
  sourceFallbackReason?: string;
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

  create: (workspaceId: string, body: { suiteId?: string; environmentId: string; testIds?: string[]; testCaseIds?: string[] }) =>
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

  getInstallUrl: (workspaceId: string, suiteId: string) =>
    request<{ url: string }>(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration/install-url`),

  rotateSecret: (workspaceId: string, suiteId: string, body: { newToken: string }) =>
    request<Record<string, unknown>>(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration/rotate-secret`, {
      method: "POST",
      body,
    }),

  listPublications: (workspaceId: string, suiteId: string) =>
    request<Publication[]>(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration/publications`),

  replayDelivery: (workspaceId: string, suiteId: string, deliveryId: string) =>
    request<Record<string, unknown>>(
      `/workspaces/${workspaceId}/suites/${suiteId}/github-integration/deliveries/${deliveryId}/replay`,
      { method: "POST" },
    ),
};

export type Publication = {
  id: string;
  status: string;
  targetPath: string;
  branchName: string;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  pullRequestState?: string | null;
  headCommitSha?: string | null;
  lastError?: string | null;
  publishedAt?: string | null;
  mergedAt?: string | null;
  createdAt: string;
  webhookDeliveries?: WebhookDelivery[];
};

export type WebhookDelivery = {
  id: string;
  deliveryId: string;
  eventName: string;
  action?: string | null;
  status: string;
  processingAttempts: number;
  lastError?: string | null;
  receivedAt: string;
  processedAt?: string | null;
  replayedAt?: string | null;
};

// ─── Repository Allowlist ────────────────────────────────────────────────────

export type AllowlistEntry = {
  id: string;
  repoOwner: string;
  repoName: string;
  approvedAt: string;
  approvedByUser?: { id: string; email: string; name: string };
};

export const repositoryAllowlist = {
  list: (workspaceId: string) =>
    request<AllowlistEntry[]>(`/workspaces/${workspaceId}/repository-allowlist`),

  add: (workspaceId: string, body: { repoOwner: string; repoName: string }) =>
    request<AllowlistEntry>(`/workspaces/${workspaceId}/repository-allowlist`, {
      method: "POST",
      body,
    }),

  remove: (workspaceId: string, entryId: string) =>
    request<{ removed: true }>(`/workspaces/${workspaceId}/repository-allowlist/${entryId}`, {
      method: "DELETE",
    }),
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

  importTestCases: (workspaceId: string, suiteId: string) =>
    request<{ importedCount: number; skippedCount: number; totalFromTestRail: number }>(
      `/workspaces/${workspaceId}/suites/${suiteId}/testrail-integration/import-test-cases`,
      { method: "POST" },
    ),

  upsertCaseLink: (workspaceId: string, suiteId: string, testId: string, body: { externalCaseId?: string; ownerEmail?: string }) =>
    request<Record<string, unknown>>(
      `/workspaces/${workspaceId}/suites/${suiteId}/testrail-links/${testId}`,
      { method: "PATCH", body },
    ),

  listCaseLinks: (workspaceId: string, suiteId: string) =>
    requestList<ExternalCaseLink>(
      `/workspaces/${workspaceId}/suites/${suiteId}/testrail-integration/case-links`,
    ),
};

// ─── External Case Link Type ─────────────────────────────────────────────────

export type ExternalCaseLink = {
  id: string;
  canonicalTestId?: string;
  externalCaseId: string;
  status: string;
  ownerEmail?: string | null;
  titleSnapshot?: string | null;
  sectionNameSnapshot?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  retryEligible?: boolean;
  updatedAt: string;
};

// ─── Tenant Feature Flags ────────────────────────────────────────────────────

export type TenantFeatureFlags = {
  tenantId: string;
  githubPublishingEnabled: boolean;
  gitExecutionEnabled: boolean;
  testRailSyncEnabled: boolean;
  maxRolloutStage: string;
};

export const featureFlags = {
  get: (tenantId: string) =>
    request<TenantFeatureFlags>(`/tenants/${tenantId}/feature-flags`),

  update: (tenantId: string, body: Partial<Omit<TenantFeatureFlags, "tenantId">>) =>
    request<TenantFeatureFlags>(`/tenants/${tenantId}/feature-flags`, { method: "PATCH", body }),
};

// ─── Notifications ───────────────────────────────────────────────────────────

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
};

export const notifications = {
  list: () =>
    request<{ items: AppNotification[]; unreadCount: number }>("/notifications"),

  markRead: (notificationId: string) =>
    request<void>(`/notifications/${notificationId}/read`, { method: "PATCH" }),

  markAllRead: () =>
    request<void>("/notifications/read-all", { method: "PATCH" }),
};
