/**
 * Selora API client used by the CLI to communicate with the Selora backend.
 */

export interface SeloraConfig {
  apiUrl: string;
  apiKey: string;
  workspaceId: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  config: SeloraConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.apiUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errPayload: { error?: { code?: string; message?: string } } = {};
    try {
      errPayload = (await response.json()) as typeof errPayload;
    } catch {
      // non-JSON error
    }
    throw new ApiError(
      response.status,
      errPayload.error?.code ?? 'HTTP_ERROR',
      errPayload.error?.message ?? response.statusText,
    );
  }

  const json = (await response.json()) as { data: T };
  return json.data;
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface RunSummary {
  id: string;
  status: string;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  canceledCount: number;
  timedOutCount: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunItemSummary {
  id: string;
  canonicalTestId: string;
  generatedTestArtifactId: string;
  status: string;
  failureSummary: string | null;
  retryCount: number;
}

export interface RepairResult {
  id: string;
  status: string;
  repairMode: string;
  diffSummary: string | null;
}

export interface SuiteInfo {
  id: string;
  name: string;
  slug: string;
}

export interface EnvironmentInfo {
  id: string;
  name: string;
}

// ── API methods ───────────────────────────────────────────────────────────────

export function listSuites(config: SeloraConfig) {
  return apiRequest<SuiteInfo[]>(
    config,
    'GET',
    `/workspaces/${config.workspaceId}/suites`,
  );
}

export function listEnvironments(config: SeloraConfig) {
  return apiRequest<EnvironmentInfo[]>(
    config,
    'GET',
    `/workspaces/${config.workspaceId}/environments`,
  );
}

export function createRun(
  config: SeloraConfig,
  body: { suiteId: string; environmentId: string },
) {
  return apiRequest<RunSummary>(
    config,
    'POST',
    `/workspaces/${config.workspaceId}/runs`,
    body,
  );
}

export function getRun(config: SeloraConfig, runId: string) {
  return apiRequest<RunSummary>(
    config,
    'GET',
    `/workspaces/${config.workspaceId}/runs/${runId}`,
  );
}

export function getRunItems(config: SeloraConfig, runId: string) {
  return apiRequest<RunItemSummary[]>(
    config,
    'GET',
    `/workspaces/${config.workspaceId}/runs/${runId}/items`,
  );
}

export function triggerRepair(
  config: SeloraConfig,
  testId: string,
  artifactId: string,
) {
  return apiRequest<RepairResult>(
    config,
    'POST',
    `/workspaces/${config.workspaceId}/tests/${testId}/generated-artifacts/${artifactId}/repair`,
    {},
  );
}
