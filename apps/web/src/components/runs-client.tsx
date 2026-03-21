'use client';

import { startTransition, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogViewer } from '@/components/log-viewer';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type {
  CanonicalTestSummary,
  Environment,
  ExecutionSourceRequestMode,
  PaginatedResult,
  RunStatus,
  TestRunComparison,
  TestRunItemSummary,
  TestRunSummary,
} from '@/lib/types';

const RUN_STATUS_OPTIONS: Array<{ value: '' | RunStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'TIMED_OUT', label: 'Timed out' },
  { value: 'CANCELED', label: 'Canceled' },
];

const RUN_SORT_OPTIONS = [
  { value: 'createdAt', label: 'Newest first' },
  { value: 'duration', label: 'Longest duration' },
  { value: 'status', label: 'Status' },
] as const;

const SOURCE_MODE_OPTIONS: Array<{ value: ExecutionSourceRequestMode; label: string }> = [
  { value: 'SUITE_DEFAULT', label: 'Suite default' },
  { value: 'PINNED_COMMIT', label: 'Pinned commit' },
  { value: 'BRANCH_HEAD', label: 'Branch head' },
];

type SortBy = (typeof RUN_SORT_OPTIONS)[number]['value'];

type PreviewState =
  | null
  | { kind: 'log'; fileName: string; content: string }
  | { kind: 'binary'; fileName: string; contentType: string; objectUrl: string }
  | {
      kind: 'gallery';
      screenshots: Array<{ id: string; fileName: string; objectUrl: string }>;
    };

function formatDate(value: string | null) {
  if (!value) {
    return 'Not started';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return 'In progress';
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}

function isActiveRun(status: TestRunSummary['status']) {
  return status === 'QUEUED' || status === 'RUNNING';
}

function statusTone(status: TestRunSummary['status']) {
  switch (status) {
    case 'PASSED':
      return 'text-[var(--success)]';
    case 'FAILED':
    case 'TIMED_OUT':
      return 'text-[var(--danger)]';
    case 'RUNNING':
    case 'QUEUED':
      return 'text-[var(--accent)]';
    default:
      return 'text-[var(--muted)]';
  }
}

function formatSourceMode(mode: ExecutionSourceRequestMode | TestRunItemSummary['resolvedSourceMode']) {
  switch (mode) {
    case 'SUITE_DEFAULT':
      return 'Suite default';
    case 'PINNED_COMMIT':
      return 'Pinned commit';
    case 'BRANCH_HEAD':
      return 'Branch head';
    default:
      return 'Storage artifact';
  }
}

function buildRunsUrl(
  workspaceId: string,
  input: {
    statusFilter: '' | RunStatus;
    historySearch: string;
    triggeredByFilter: string;
    sortBy: SortBy;
  },
) {
  const searchParams = new URLSearchParams({ page: '1', pageSize: '20' });
  if (input.statusFilter) {
    searchParams.set('status', input.statusFilter);
  }
  if (input.historySearch.trim()) {
    searchParams.set('search', input.historySearch.trim());
  }
  if (input.triggeredByFilter.trim()) {
    searchParams.set('triggeredBy', input.triggeredByFilter.trim());
  }
  if (input.sortBy !== 'createdAt') {
    searchParams.set('sortBy', input.sortBy);
  }
  return buildApiUrl(`/workspaces/${workspaceId}/runs?${searchParams.toString()}`);
}

function releasePreview(preview: PreviewState) {
  if (!preview) {
    return;
  }

  if (preview.kind === 'binary') {
    URL.revokeObjectURL(preview.objectUrl);
    return;
  }

  if (preview.kind === 'gallery') {
    preview.screenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.objectUrl));
  }
}

export function RunsClient({
  workspaceId,
  canManage,
  environments,
  eligibleTests,
  initialRuns,
  initialSelectedRun,
  initialSelectedRunItems,
}: {
  workspaceId: string;
  canManage: boolean;
  environments: Environment[];
  eligibleTests: CanonicalTestSummary[];
  initialRuns: PaginatedResult<TestRunSummary>;
  initialSelectedRun: TestRunSummary | null;
  initialSelectedRunItems: TestRunItemSummary[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<TestRunSummary | null>(initialSelectedRun);
  const [selectedRunItems, setSelectedRunItems] = useState<TestRunItemSummary[]>(initialSelectedRunItems);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialSelectedRun?.id ?? initialRuns.items[0]?.id ?? null,
  );
  const [environmentId, setEnvironmentId] = useState(
    environments.find((item) => item.isDefault)?.id ?? environments[0]?.id ?? '',
  );
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [requestedSourceMode, setRequestedSourceMode] = useState<ExecutionSourceRequestMode>('SUITE_DEFAULT');
  const [requestedGitRef, setRequestedGitRef] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | RunStatus>('');
  const [historySearch, setHistorySearch] = useState('');
  const [triggeredByFilter, setTriggeredByFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [comparisonRunIds, setComparisonRunIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<TestRunComparison | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);

  async function refreshData(nextSelectedRunId = selectedRunId) {
    setRefreshing(true);

    try {
      const nextRuns = await parseApiResponse<PaginatedResult<TestRunSummary>>(
        await fetch(
          buildRunsUrl(workspaceId, {
            statusFilter,
            historySearch,
            triggeredByFilter,
            sortBy,
          }),
          {
            credentials: 'include',
            cache: 'no-store',
          },
        ),
      );

      const effectiveRunId = nextSelectedRunId ?? nextRuns.items[0]?.id ?? null;
      const [nextSelectedRun, nextItems] = effectiveRunId
        ? await Promise.all([
            parseApiResponse<TestRunSummary>(
              await fetch(buildApiUrl(`/workspaces/${workspaceId}/runs/${effectiveRunId}`), {
                credentials: 'include',
                cache: 'no-store',
              }),
            ),
            parseApiResponse<TestRunItemSummary[]>(
              await fetch(buildApiUrl(`/workspaces/${workspaceId}/runs/${effectiveRunId}/items`), {
                credentials: 'include',
                cache: 'no-store',
              }),
            ),
          ])
        : [null, []];

      startTransition(() => {
        setRuns(nextRuns);
        setSelectedRun(nextSelectedRun);
        setSelectedRunItems(nextItems);
        setSelectedRunId(effectiveRunId);
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh run data.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!runs.items.some((item) => isActiveRun(item.status)) && !(selectedRun && isActiveRun(selectedRun.status))) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshData();
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [runs.items, selectedRun, statusFilter, historySearch, triggeredByFilter, sortBy]);

  useEffect(() => {
    return () => {
      releasePreview(preview);
    };
  }, [preview]);

  function syncRunQuery(runId: string | null) {
    const searchParams = new URLSearchParams(window.location.search);
    if (runId) {
      searchParams.set('run', runId);
    } else {
      searchParams.delete('run');
    }

    const query = searchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function closePreview() {
    setPreview((current) => {
      releasePreview(current);
      return null;
    });
  }

  function toggleTest(testId: string) {
    setSelectedTestIds((current) =>
      current.includes(testId) ? current.filter((item) => item !== testId) : [...current, testId],
    );
  }

  function toggleComparisonRun(runId: string) {
    setComparisonRunIds((current) => {
      if (current.includes(runId)) {
        return current.filter((item) => item !== runId);
      }

      if (current.length === 2) {
        return current[1] ? [current[1], runId] : [runId];
      }

      return [...current, runId];
    });
  }

  async function loadComparison() {
    if (comparisonRunIds.length !== 2) {
      return;
    }

    setComparing(true);
    setError(null);

    try {
      const data = await parseApiResponse<TestRunComparison>(
        await fetch(
          buildApiUrl(
            `/workspaces/${workspaceId}/runs/compare?runIdA=${comparisonRunIds[0]}&runIdB=${comparisonRunIds[1]}`,
          ),
          {
            credentials: 'include',
            cache: 'no-store',
          },
        ),
      );

      setComparison(data);
    } catch (comparisonError) {
      setError(comparisonError instanceof Error ? comparisonError.message : 'Unable to compare runs.');
    } finally {
      setComparing(false);
    }
  }

  async function createRun() {
    if (!canManage || !environmentId || selectedTestIds.length === 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const createdRun = await parseApiResponse<TestRunSummary>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/runs`), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            environmentId,
            testIds: selectedTestIds,
            sourceMode: requestedSourceMode,
            gitRef: requestedGitRef.trim() || undefined,
          }),
        }),
      );

      setSelectedTestIds([]);
      setRequestedGitRef('');
      setSelectedRunId(createdRun.id);
      setSuccessMessage(`Run ${createdRun.id.slice(0, 8)} queued for ${selectedTestIds.length} test(s).`);
      syncRunQuery(createdRun.id);
      await refreshData(createdRun.id);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Unable to start the selected run.');
    } finally {
      setSubmitting(false);
    }
  }

  async function viewRun(runId: string) {
    setSelectedRunId(runId);
    syncRunQuery(runId);
    await refreshData(runId);
  }

  async function cancelRun() {
    if (!selectedRun || !canManage || !isActiveRun(selectedRun.status)) {
      return;
    }

    setCanceling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const canceled = await parseApiResponse<TestRunSummary>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/runs/${selectedRun.id}/cancel`), {
          method: 'POST',
          credentials: 'include',
        }),
      );

      setSuccessMessage(`Run ${canceled.id.slice(0, 8)} canceled.`);
      await refreshData(canceled.id);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel the run.');
    } finally {
      setCanceling(false);
    }
  }

  async function previewArtifact(itemId: string, artifact: TestRunItemSummary['artifacts'][number]) {
    if (!selectedRun) {
      return;
    }

    setError(null);

    try {
      const response = await fetch(
        buildApiUrl(`/workspaces/${workspaceId}/runs/${selectedRun.id}/items/${itemId}/artifacts/${artifact.id}/download`),
        {
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error('Unable to load artifact.');
      }

      const currentContentType = response.headers.get('content-type') || artifact.contentType;
      if (artifact.artifactType === 'LOG' || currentContentType.startsWith('text/')) {
        const textContent = await response.text();
        closePreview();
        setPreview({
          kind: 'log',
          fileName: artifact.fileName,
          content: textContent,
        });
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      closePreview();
      setPreview({
        kind: 'binary',
        fileName: artifact.fileName,
        contentType: currentContentType,
        objectUrl,
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to preview artifact.');
    }
  }

  async function openScreenshotGallery(item: TestRunItemSummary) {
    if (!selectedRun) {
      return;
    }

    setError(null);

    try {
      const screenshots = item.artifacts.filter((artifact) => artifact.artifactType === 'SCREENSHOT');
      const galleryItems = await Promise.all(
        screenshots.map(async (artifact) => {
          const response = await fetch(
            buildApiUrl(`/workspaces/${workspaceId}/runs/${selectedRun.id}/items/${item.id}/artifacts/${artifact.id}/download`),
            {
              credentials: 'include',
            },
          );

          if (!response.ok) {
            throw new Error(`Unable to load screenshot ${artifact.fileName}.`);
          }

          const blob = await response.blob();
          return {
            id: artifact.id,
            fileName: artifact.fileName,
            objectUrl: URL.createObjectURL(blob),
          };
        }),
      );

      closePreview();
      setPreview({ kind: 'gallery', screenshots: galleryItems });
    } catch (galleryError) {
      setError(galleryError instanceof Error ? galleryError.message : 'Unable to open screenshot gallery.');
    }
  }

  async function downloadArtifact(itemId: string, artifactId: string, fileName: string) {
    if (!selectedRun) {
      return;
    }

    try {
      const response = await fetch(
        buildApiUrl(`/workspaces/${workspaceId}/runs/${selectedRun.id}/items/${itemId}/artifacts/${artifactId}/download`),
        {
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error('Unable to download artifact.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download artifact.');
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="eyebrow">Sprint 5</p>
          <h1 className="section-title text-4xl font-semibold">Runs</h1>
          <p className="max-w-3xl text-[var(--muted)]">
            Launch validated tests with an explicit execution source, inspect the resolved lineage for each run item, and compare historical outcomes side by side.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="status-pill">{eligibleTests.length} execution-ready tests</span>
          <span className="status-pill">{runs.totalCount} filtered runs</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Launcher</p>
            <h2 className="section-title text-2xl font-semibold">Run selected tests</h2>
            <p className="text-sm text-[var(--muted)]">
              Each request now resolves its execution source before worker startup. Choose the suite default, pin a commit, or ask for the latest branch head.
            </p>
          </div>

          {canManage ? (
            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Environment</span>
                <select className="form-input" value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name} · {environment.baseUrl} · timeout {environment.testTimeoutMs} ms · retries {environment.maxRetries}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
                <label className="block space-y-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Execution source</span>
                  <select
                    className="form-input"
                    value={requestedSourceMode}
                    onChange={(event) => setRequestedSourceMode(event.target.value as ExecutionSourceRequestMode)}
                  >
                    {SOURCE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Git ref or commit</span>
                  <input
                    className="form-input"
                    placeholder={requestedSourceMode === 'BRANCH_HEAD' ? 'main or release/next' : 'Optional SHA, tag, or branch'}
                    value={requestedGitRef}
                    onChange={(event) => setRequestedGitRef(event.target.value)}
                  />
                </label>
              </div>

              <p className="text-xs text-[var(--muted)]">
                Suite default defers to the suite policy. Pinned commit resolves a concrete SHA before queueing. Branch head resolves the latest commit for the branch at launch time.
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Tests</span>
                  <div className="flex gap-2">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setSelectedTestIds(eligibleTests.map((test) => test.id))}
                    >
                      Select all
                    </button>
                    <button className="secondary-button" type="button" onClick={() => setSelectedTestIds([])}>
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-[24rem] space-y-2 overflow-auto rounded-none border border-[var(--line)] bg-[var(--bg)] p-3">
                  {eligibleTests.length === 0 ? (
                    <div className="empty-state min-h-[8rem]">No validated tests are available yet.</div>
                  ) : (
                    eligibleTests.map((test) => {
                      const latestArtifact = test.generatedArtifacts[0];
                      const checked = selectedTestIds.includes(test.id);

                      return (
                        <label
                          key={test.id}
                          className="flex cursor-pointer items-start gap-3 border border-transparent bg-white px-4 py-3 transition hover:border-[var(--line)]"
                        >
                          <input checked={checked} type="checkbox" onChange={() => toggleTest(test.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[var(--text)]">{test.name}</span>
                            <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">
                              {test.status} · Artifact v{latestArtifact?.version ?? 'n/a'}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  className="primary-button"
                  disabled={submitting || !environmentId || selectedTestIds.length === 0}
                  type="button"
                  onClick={() => void createRun()}
                >
                  {submitting ? 'Starting run...' : `Run ${selectedTestIds.length || ''} selected test${selectedTestIds.length === 1 ? '' : 's'}`}
                </button>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{selectedTestIds.length} selected</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">View-only access — starting runs is disabled.</p>
          )}

          {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
          {successMessage ? <p className="mt-4 text-sm text-[var(--success)]">{successMessage}</p> : null}
        </section>

        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-4">
            <div>
              <p className="eyebrow">History</p>
              <h2 className="section-title text-2xl font-semibold">Searchable runs</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="form-input" placeholder="Search by test name" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} />
              <input className="form-input" placeholder="Triggered by user or email" value={triggeredByFilter} onChange={(event) => setTriggeredByFilter(event.target.value)} />
              <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | RunStatus)}>
                {RUN_STATUS_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select className="form-input" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
                {RUN_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="secondary-button" type="button" onClick={() => void refreshData()}>
                {refreshing ? 'Applying...' : 'Apply'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setHistorySearch('');
                  setTriggeredByFilter('');
                  setSortBy('createdAt');
                  void refreshData();
                }}
              >
                Reset
              </button>
              <button
                className="secondary-button"
                disabled={comparisonRunIds.length !== 2 || comparing}
                type="button"
                onClick={() => void loadComparison()}
              >
                {comparing ? 'Comparing...' : `Compare ${comparisonRunIds.length}/2 selected`}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {runs.items.length === 0 ? (
              <div className="empty-state">No runs match the current filters.</div>
            ) : (
              runs.items.map((run) => (
                <div
                  key={run.id}
                  className={`border px-4 py-4 transition ${selectedRunId === run.id ? 'border-[var(--brand)] bg-white' : 'border-[var(--line)] bg-white hover:bg-[var(--bg)]'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      checked={comparisonRunIds.includes(run.id)}
                      type="checkbox"
                      onChange={() => toggleComparisonRun(run.id)}
                    />
                    <button className="min-w-0 flex-1 text-left" type="button" onClick={() => void viewRun(run.id)}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">Run {run.id.slice(0, 8)}</span>
                            <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${statusTone(run.status)}`}>
                              {run.status}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">
                            {run.environment.name} · Triggered by {run.triggeredBy.name}
                          </p>
                        </div>
                        <div className="text-right text-xs text-[var(--muted)]">
                          <p>{formatDate(run.createdAt)}</p>
                          <p>{run.finishedAt ? formatDuration(run.durationMs) : 'Active'}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                        <span className="status-pill">{run.totalCount} total</span>
                        <span className="status-pill">{run.passedCount} passed</span>
                        <span className="status-pill">{run.failedCount} failed</span>
                        <span className="status-pill">{run.timedOutCount} timed out</span>
                        <span className="status-pill">{run.runningCount} running</span>
                        <span className="status-pill">{formatSourceMode(run.requestedSourceMode)}</span>
                        {run.requestedGitRef ? <span className="status-pill">{run.requestedGitRef}</span> : null}
                      </div>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {comparison ? (
        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Comparison</p>
              <h2 className="section-title text-2xl font-semibold">Run diff</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => setComparison(null)}>
              Close comparison
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Changed tests</p>
              <p className="mt-2 text-2xl font-semibold">{comparison.summary.changedCount}</p>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Only in A</p>
              <p className="mt-2 text-2xl font-semibold">{comparison.summary.onlyInA}</p>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Only in B</p>
              <p className="mt-2 text-2xl font-semibold">{comparison.summary.onlyInB}</p>
            </div>
            <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Total tests</p>
              <p className="mt-2 text-2xl font-semibold">{comparison.summary.totalTests}</p>
            </div>
          </div>

          <div className="mt-5 overflow-auto rounded-none border border-[var(--line)] bg-[var(--bg)]">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999] md:text-[11px]">
                  <th className="px-3 py-2.5 md:px-4 md:py-3">Test</th>
                  <th className="px-3 py-2.5 md:px-4 md:py-3">Run A</th>
                  <th className="px-3 py-2.5 md:px-4 md:py-3">Run B</th>
                  <th className="px-3 py-2.5 md:px-4 md:py-3">Changed</th>
                </tr>
              </thead>
              <tbody>
                {comparison.comparisons.map((item) => (
                  <tr key={item.canonicalTestId} className="border-b border-[var(--line)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium md:px-4 md:py-3">{item.testName}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3">
                      {item.runA ? `${item.runA.status} · ${formatDuration(item.runA.durationMs)}` : 'Not present'}
                    </td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3">
                      {item.runB ? `${item.runB.status} · ${formatDuration(item.runB.durationMs)}` : 'Not present'}
                    </td>
                    <td className={`px-3 py-2.5 font-medium md:px-4 md:py-3 ${item.changed ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                      {item.changed ? 'Changed' : 'Same'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Detail</p>
            <h2 className="section-title text-2xl font-semibold">
              {selectedRun ? `Run ${selectedRun.id.slice(0, 8)}` : 'Run detail'}
            </h2>
          </div>
          {selectedRun ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="status-pill">{selectedRun.environment.name}</span>
              <span className={`status-pill ${statusTone(selectedRun.status)}`}>{selectedRun.status}</span>
              <span className="status-pill">Started {formatDate(selectedRun.startedAt)}</span>
              {canManage && isActiveRun(selectedRun.status) ? (
                <button className="secondary-button" disabled={canceling} type="button" onClick={() => void cancelRun()}>
                  {canceling ? 'Canceling...' : 'Cancel run'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!selectedRun ? (
          <p className="text-sm text-[var(--muted)]">Select a run to inspect its items and captured artifacts.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Progress</p>
                <p className="mt-2 text-2xl font-semibold">
                  {selectedRun.passedCount + selectedRun.failedCount + selectedRun.timedOutCount}/{selectedRun.totalCount}
                </p>
              </div>
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Passed</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--success)]">{selectedRun.passedCount}</p>
              </div>
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Failed</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--danger)]">
                  {selectedRun.failedCount + selectedRun.timedOutCount}
                </p>
              </div>
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Duration</p>
                <p className="mt-2 text-2xl font-semibold">
                  {selectedRun.finishedAt ? formatDuration(selectedRun.durationMs) : 'Active'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Requested source</p>
                <p className="mt-2 text-lg font-semibold">{formatSourceMode(selectedRun.requestedSourceMode)}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">{selectedRun.requestedGitRef ?? 'No explicit ref supplied'}</p>
              </div>
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Resolved modes</p>
                <p className="mt-2 text-lg font-semibold">
                  {Array.from(new Set(selectedRunItems.map((item) => formatSourceMode(item.resolvedSourceMode)))).join(', ') || 'Pending'}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">Run items may diverge if Git resolution falls back to storage.</p>
              </div>
              <div className="border border-[var(--line)] bg-[var(--bg)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Fallbacks</p>
                <p className="mt-2 text-lg font-semibold">
                  {selectedRunItems.filter((item) => item.sourceFallbackReason).length}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">Run items that dropped back to the stored artifact.</p>
              </div>
            </div>

            <div className="space-y-3">
              {selectedRunItems.map((item) => {
                const screenshotCount = item.artifacts.filter((artifact) => artifact.artifactType === 'SCREENSHOT').length;

                return (
                  <article key={item.id} className="border border-[var(--line)] bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">#{item.sequence}</span>
                          <span>{item.canonicalTest.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Artifact v{item.generatedTestArtifact.version} · {item.generatedTestArtifact.fileName} · Retries used {item.retryCount}
                        </p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                          <div className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Requested</p>
                            <p className="mt-1 font-medium text-[var(--text)]">{formatSourceMode(item.requestedSourceMode)}</p>
                            <p className="mt-1">{item.requestedGitRef ?? 'No explicit ref'}</p>
                          </div>
                          <div className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Resolved</p>
                            <p className="mt-1 font-medium text-[var(--text)]">{formatSourceMode(item.resolvedSourceMode)}</p>
                            <p className="mt-1">{item.resolvedGitRef ?? 'Stored artifact'}</p>
                          </div>
                          <div className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Commit</p>
                            <p className="mt-1 break-all font-medium text-[var(--text)]">{item.resolvedCommitSha ?? item.publication?.mergeCommitSha ?? 'Not pinned'}</p>
                          </div>
                          <div className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Publication</p>
                            <p className="mt-1 font-medium text-[var(--text)]">{item.publication?.targetPath ?? 'Not published'}</p>
                            <p className="mt-1">{item.publication?.pullRequestUrl ? 'PR linked' : 'No PR link'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${statusTone(item.status)}`}>{item.status}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">{formatDate(item.finishedAt ?? item.startedAt)}</p>
                      </div>
                    </div>

                    {item.failureSummary ? (
                      <p className="mt-3 border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
                        {item.failureSummary}
                      </p>
                    ) : null}

                    {item.sourceFallbackReason ? (
                      <p className="mt-3 border border-[rgba(217,119,6,0.2)] bg-[rgba(245,158,11,0.08)] px-3 py-2 text-sm text-[color:#9a6700]">
                        Fallback applied: {item.sourceFallbackReason}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span className="status-pill">{item.artifacts.length} artifacts</span>
                      {screenshotCount > 0 ? (
                        <button className="secondary-button !px-3 !py-1 text-[11px]" type="button" onClick={() => void openScreenshotGallery(item)}>
                          View screenshot gallery ({screenshotCount})
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      {item.artifacts.map((artifact) => (
                        <span key={artifact.id} className="flex items-center gap-2 border border-[var(--line)] bg-[var(--bg)] px-3 py-1">
                          <span>{artifact.artifactType.toLowerCase()} · {artifact.fileName}</span>
                          <button className="secondary-button !px-3 !py-1 text-[11px]" type="button" onClick={() => void previewArtifact(item.id, artifact)}>
                            Preview
                          </button>
                          <button className="secondary-button !px-3 !py-1 text-[11px]" type="button" onClick={() => void downloadArtifact(item.id, artifact.id, artifact.fileName)}>
                            Download
                          </button>
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
              {selectedRunItems.length === 0 ? (
                <div className="empty-state">No run items were loaded for this run.</div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.52)] p-6">
          <div className="max-h-[85vh] w-full max-w-6xl overflow-auto rounded-none bg-[var(--panel)] p-6 shadow-2xl">
            {preview.kind === 'log' ? <LogViewer content={preview.content} fileName={preview.fileName} onClose={closePreview} /> : null}

            {preview.kind === 'gallery' ? <ScreenshotGallery screenshots={preview.screenshots} onClose={closePreview} /> : null}

            {preview.kind === 'binary' ? (
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow">Artifact Preview</p>
                    <h3 className="section-title text-xl font-semibold">{preview.fileName}</h3>
                  </div>
                  <button className="secondary-button" type="button" onClick={closePreview}>
                    Close
                  </button>
                </div>

                {preview.contentType.startsWith('image/') ? (
                  <img alt={preview.fileName} className="max-h-[70vh] w-auto border border-[var(--line)]" src={preview.objectUrl} />
                ) : (
                  <div className="space-y-3 rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
                    <p className="text-sm text-[var(--muted)]">
                      This artifact cannot be previewed inline. Use download for trace archives, video, or other binary content.
                    </p>
                    <a className="primary-button inline-flex" download={preview.fileName} href={preview.objectUrl}>
                      Download artifact
                    </a>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}