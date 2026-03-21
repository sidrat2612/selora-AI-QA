import { cookies } from 'next/headers';
import { buildApiUrl } from './api';
import type {
  AuditEventSummary,
  BetaFeedback,
  CanonicalTestDetail,
  CanonicalTestSummary,
  Environment,
  GeneratedArtifactDetail,
  Membership,
  PaginatedResult,
  RepairAnalytics,
  RepairAttemptSummary,
  RecordingSummary,
  RetentionSetting,
  SessionData,
  TenantLifecycleSummary,
  TenantQuotaOverview,
  TestRunItemSummary,
  TestRunSummary,
  Workspace,
} from './types';

async function serverFetch<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(buildApiUrl(path), {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

function buildPath(path: string, query?: Record<string, string | number | undefined>) {
  if (!query) {
    return path;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export async function getServerSession() {
  return serverFetch<SessionData>('/auth/session');
}

export async function getWorkspaceDetails(workspaceId: string) {
  return serverFetch<Workspace & { environments: Environment[]; retentionSetting: RetentionSetting | null }>(
    `/workspaces/${workspaceId}`,
  );
}

export async function getMemberships(workspaceId: string) {
  const data = await serverFetch<Membership[]>(`/workspaces/${workspaceId}/memberships`);
  return data ?? [];
}

export async function getEnvironments(workspaceId: string) {
  const data = await serverFetch<Environment[]>(`/workspaces/${workspaceId}/environments`);
  return data ?? [];
}

export async function getRetention(workspaceId: string) {
  return serverFetch<RetentionSetting>(`/workspaces/${workspaceId}/settings/retention`);
}

export async function getTenantQuotas(tenantId: string) {
  return serverFetch<TenantQuotaOverview>(`/tenants/${tenantId}/quotas`);
}

export async function getTenantLifecycle(tenantId: string) {
  return serverFetch<TenantLifecycleSummary>(`/tenants/${tenantId}`);
}

export async function getFeedback(
  workspaceId: string,
  query?: Record<string, string | number | undefined>,
) {
  const data = await serverFetch<BetaFeedback[]>(buildPath(`/workspaces/${workspaceId}/feedback`, query));
  return data ?? [];
}

export async function getRecordings(
  workspaceId: string,
  query?: Record<string, string | number | undefined>,
) {
  return (
    (await serverFetch<PaginatedResult<RecordingSummary>>(
      buildPath(`/workspaces/${workspaceId}/recordings`, query),
    )) ?? {
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
    }
  );
}

export async function getCanonicalTests(
  workspaceId: string,
  query?: Record<string, string | number | undefined>,
) {
  return (
    (await serverFetch<PaginatedResult<CanonicalTestSummary>>(
      buildPath(`/workspaces/${workspaceId}/tests`, query),
    )) ?? {
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
    }
  );
}

export async function getCanonicalTestDetail(workspaceId: string, testId: string) {
  return serverFetch<CanonicalTestDetail>(`/workspaces/${workspaceId}/tests/${testId}`);
}

export async function getGeneratedArtifactDetail(
  workspaceId: string,
  testId: string,
  artifactId: string,
) {
  return serverFetch<GeneratedArtifactDetail>(
    `/workspaces/${workspaceId}/tests/${testId}/generated-artifacts/${artifactId}`,
  );
}

export async function getRepairAttempts(workspaceId: string, testId: string) {
  const data = await serverFetch<RepairAttemptSummary[]>(
    `/workspaces/${workspaceId}/tests/${testId}/repair-attempts`,
  );
  return data ?? [];
}

export async function getRepairAnalytics(
  workspaceId: string,
  query?: Record<string, string | number | undefined>,
) {
  return serverFetch<RepairAnalytics>(buildPath(`/workspaces/${workspaceId}/repair-analytics`, query));
}

export async function getRuns(
  workspaceId: string,
  query?: Record<string, string | number | undefined>,
) {
  return (
    (await serverFetch<PaginatedResult<TestRunSummary>>(
      buildPath(`/workspaces/${workspaceId}/runs`, query),
    )) ?? {
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
    }
  );
}

export async function getRunDetail(workspaceId: string, runId: string) {
  return serverFetch<TestRunSummary>(`/workspaces/${workspaceId}/runs/${runId}`);
}

export async function getRunItems(workspaceId: string, runId: string) {
  const data = await serverFetch<TestRunItemSummary[]>(`/workspaces/${workspaceId}/runs/${runId}/items`);
  return data ?? [];
}

export async function getAuditEvents(
  workspaceId: string,
  query?: Record<string, string | number | undefined>,
) {
  return (
    (await serverFetch<PaginatedResult<AuditEventSummary>>(
      buildPath(`/workspaces/${workspaceId}/audit-events`, query),
    )) ?? {
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
    }
  );
}

export async function getAuditEventTypes(workspaceId: string) {
  const data = await serverFetch<string[]>(`/workspaces/${workspaceId}/audit-events/event-types`);
  return data ?? [];
}