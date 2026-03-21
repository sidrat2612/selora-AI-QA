'use client';

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type {
  CanonicalTestSummary,
  PaginatedResult,
  RecordingStatus,
  RecordingSummary,
  TestStatus,
} from '@/lib/types';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const RECORDING_STATUS_OPTIONS: Array<{ value: '' | RecordingStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'UPLOADED', label: 'Uploaded' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'NORMALIZED', label: 'Normalized' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const TEST_STATUS_OPTIONS: Array<{ value: '' | TestStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'INGESTED', label: 'Ingested' },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'VALIDATING', label: 'Validating' },
  { value: 'VALIDATED', label: 'Validated' },
  { value: 'AUTO_REPAIRED', label: 'Auto repaired' },
  { value: 'NEEDS_HUMAN_REVIEW', label: 'Needs human review' },
  { value: 'ARCHIVED', label: 'Archived' },
];

type RecordingQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: '' | RecordingStatus;
};

type TestQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: '' | TestStatus;
  tag: string;
};

function hasActiveIngestion(recordings: RecordingSummary[]) {
  return recordings.some((recording) => recording.status === 'UPLOADED' || recording.status === 'PROCESSING');
}

function hasActiveValidation(tests: CanonicalTestSummary[]) {
  return tests.some((test) => test.status === 'GENERATED' || test.status === 'VALIDATING');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function summarizeDefinition(definition: Record<string, unknown>) {
  const steps = Array.isArray(definition['steps']) ? definition['steps'].length : 0;
  const actions = Array.isArray(definition['actions']) ? definition['actions'].length : 0;
  return `${steps} step${steps === 1 ? '' : 's'} · ${actions} action${actions === 1 ? '' : 's'}`;
}

function describeRange(result: PaginatedResult<unknown>) {
  if (result.totalCount === 0) {
    return 'Showing 0 of 0';
  }

  const start = (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.totalCount);
  return `Showing ${start}-${end} of ${result.totalCount}`;
}

function recordingTone(status: RecordingStatus) {
  switch (status) {
    case 'NORMALIZED':
      return 'text-[var(--success)]';
    case 'PROCESSING':
    case 'UPLOADED':
      return 'text-[#f59e0b]';
    case 'FAILED':
      return 'text-[var(--danger)]';
    default:
      return 'text-[var(--muted)]';
  }
}

function testTone(status: TestStatus) {
  switch (status) {
    case 'VALIDATED':
    case 'AUTO_REPAIRED':
      return 'text-[var(--success)]';
    case 'VALIDATING':
    case 'GENERATED':
    case 'INGESTED':
      return 'text-[#f59e0b]';
    case 'NEEDS_HUMAN_REVIEW':
      return 'text-[var(--danger)]';
    default:
      return 'text-[var(--muted)]';
  }
}

function buildListPath(path: string, query: Record<string, string | number | undefined>) {
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

export function RecordingCatalogClient({
  workspaceId,
  initialRecordingQuery,
  initialRecordings,
  initialTestQuery,
  initialTests,
  canManage,
}: {
  workspaceId: string;
  initialRecordingQuery: RecordingQuery;
  initialRecordings: PaginatedResult<RecordingSummary>;
  initialTestQuery: TestQuery;
  initialTests: PaginatedResult<CanonicalTestSummary>;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [recordingResult, setRecordingResult] = useState(initialRecordings);
  const [testResult, setTestResult] = useState(initialTests);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingTestId, setGeneratingTestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recordingQuery, setRecordingQuery] = useState<RecordingQuery>(initialRecordingQuery);
  const [recordingDraft, setRecordingDraft] = useState<RecordingQuery>(initialRecordingQuery);
  const [testQuery, setTestQuery] = useState<TestQuery>(initialTestQuery);
  const [testDraft, setTestDraft] = useState<TestQuery>(initialTestQuery);

  const recordings = recordingResult.items;
  const tests = testResult.items;
  const autoRepairedCount = tests.filter((item) => item.status === 'AUTO_REPAIRED').length;
  const needsHumanReviewCount = tests.filter((item) => item.status === 'NEEDS_HUMAN_REVIEW').length;
  const validatingCount = tests.filter((item) => item.status === 'VALIDATING').length;

  function syncUrl(nextRecordingQuery: RecordingQuery, nextTestQuery: TestQuery) {
    const searchParams = new URLSearchParams();

    const setParam = (key: string, value: string | number | undefined, fallback?: string | number) => {
      if (value === undefined || value === '' || value === fallback) {
        return;
      }

      searchParams.set(key, String(value));
    };

    setParam('rp', nextRecordingQuery.page, 1);
    setParam('rps', nextRecordingQuery.pageSize, 20);
    setParam('rs', nextRecordingQuery.search);
    setParam('rstatus', nextRecordingQuery.status);
    setParam('tp', nextTestQuery.page, 1);
    setParam('tps', nextTestQuery.pageSize, 20);
    setParam('ts', nextTestQuery.search);
    setParam('tstatus', nextTestQuery.status);
    setParam('ttag', nextTestQuery.tag);

    const query = searchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function refreshData(nextRecordingQuery = recordingQuery, nextTestQuery = testQuery) {
    try {
      const [nextRecordings, nextTests] = await Promise.all([
        parseApiResponse<PaginatedResult<RecordingSummary>>(
          await fetch(buildApiUrl(buildListPath(`/workspaces/${workspaceId}/recordings`, nextRecordingQuery)), {
            credentials: 'include',
            cache: 'no-store',
          }),
        ),
        parseApiResponse<PaginatedResult<CanonicalTestSummary>>(
          await fetch(buildApiUrl(buildListPath(`/workspaces/${workspaceId}/tests`, nextTestQuery)), {
            credentials: 'include',
            cache: 'no-store',
          }),
        ),
      ]);

      startTransition(() => {
        setRecordingResult(nextRecordings);
        setTestResult(nextTests);
        setRecordingQuery(nextRecordingQuery);
        setTestQuery(nextTestQuery);
      });
      syncUrl(nextRecordingQuery, nextTestQuery);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh test catalog.');
    }
  }

  useEffect(() => {
    if (!hasActiveIngestion(recordings) && !hasActiveValidation(tests)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshData();
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [recordings, tests]);

  async function uploadRecording(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !selectedFile) {
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.set('file', selectedFile);

    try {
      await parseApiResponse<{ recordingId: string; status: string; queued: boolean }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/recordings`), {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }),
      );

      const nextRecordingQuery = { ...recordingQuery, page: 1 };
      setSelectedFile(null);
      setRecordingDraft(nextRecordingQuery);
      setSuccessMessage('Recording uploaded. Ingestion has started in the background.');
      await refreshData(nextRecordingQuery, testQuery);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload recording.');
    } finally {
      setUploading(false);
    }
  }

  async function generateTest(testId: string) {
    if (!canManage) {
      return;
    }

    setGeneratingTestId(testId);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await parseApiResponse<{ summary: string }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/tests/${testId}/generate`), {
          method: 'POST',
          credentials: 'include',
        }),
      );
      setSuccessMessage(result.summary);
      await refreshData(recordingQuery, testQuery);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate Playwright test.');
    } finally {
      setGeneratingTestId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="eyebrow">Sprint 2</p>
          <h1 className="section-title text-4xl font-semibold">Recording ingestion</h1>
          <p className="max-w-3xl text-[var(--muted)]">
            Upload a Playwright codegen TypeScript recording, let the ingestion worker normalize it into a canonical test, and review the resulting test catalog as background processing completes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="status-pill">{recordingResult.totalCount} recordings</span>
          <span className="status-pill">{testResult.totalCount} canonical tests</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Upload</p>
            <h2 className="section-title text-2xl font-semibold">Import recording</h2>
            <p className="text-sm text-[var(--muted)]">
              Accepts Playwright codegen `.ts` files only. Uploads are workspace-scoped and processed asynchronously.
            </p>
          </div>

          {canManage ? (
            <form className="space-y-4" onSubmit={uploadRecording}>
              <label className="block rounded-none border border-dashed border-[var(--line)] bg-[var(--bg)] p-5">
                <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Recording file</span>
                <input
                  accept=".ts,text/typescript"
                  className="form-input"
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <span className="mt-3 block text-xs text-[var(--muted)]">
                  Recommended: raw Playwright codegen output with a single end-to-end flow.
                </span>
              </label>

              <div className="flex items-center gap-3">
                <button className="primary-button" disabled={!selectedFile || uploading} type="submit">
                  {uploading ? 'Uploading...' : 'Upload recording'}
                </button>
                {selectedFile ? <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#999999]">{selectedFile.name}</span> : null}
              </div>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">View-only access — recording uploads are disabled.</p>
          )}

          {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
          {successMessage ? <p className="mt-4 text-sm text-[var(--success)]">{successMessage}</p> : null}
        </section>

        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Queue</p>
              <h2 className="section-title text-2xl font-semibold">Recent recordings</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => void refreshData()}>
              Refresh
            </button>
          </div>

          <form
            className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.85fr)_minmax(0,0.55fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const nextQuery = { ...recordingDraft, page: 1 };
              setRecordingDraft(nextQuery);
              void refreshData(nextQuery, testQuery);
            }}
          >
            <input
              className="form-input"
              placeholder="Search filename or canonical test"
              type="search"
              value={recordingDraft.search}
              onChange={(event) => setRecordingDraft((current) => ({ ...current, search: event.target.value }))}
            />
            <select
              className="form-input"
              value={recordingDraft.status}
              onChange={(event) =>
                setRecordingDraft((current) => ({
                  ...current,
                  status: event.target.value as RecordingQuery['status'],
                }))
              }
            >
              {RECORDING_STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="form-input"
              value={recordingDraft.pageSize}
              onChange={(event) =>
                setRecordingDraft((current) => ({
                  ...current,
                  pageSize: Number(event.target.value),
                }))
              }
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} / page
                </option>
              ))}
            </select>
            <button className="secondary-button" type="submit">
              Apply
            </button>
          </form>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{describeRange(recordingResult)}</span>
            <div className="flex items-center gap-2">
              <button
                className="secondary-button"
                disabled={recordingQuery.page <= 1}
                type="button"
                onClick={() => {
                  const nextQuery = { ...recordingQuery, page: recordingQuery.page - 1 };
                  setRecordingDraft(nextQuery);
                  void refreshData(nextQuery, testQuery);
                }}
              >
                Previous
              </button>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">
                Page {recordingResult.page}
              </span>
              <button
                className="secondary-button"
                disabled={!recordingResult.hasMore}
                type="button"
                onClick={() => {
                  const nextQuery = { ...recordingQuery, page: recordingQuery.page + 1 };
                  setRecordingDraft(nextQuery);
                  void refreshData(nextQuery, testQuery);
                }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {recordings.length === 0 ? (
              <div className="empty-state min-h-[8rem]">
                No recordings yet. Upload a Playwright codegen file to start the ingestion pipeline.
              </div>
            ) : (
              recordings.map((recording) => (
                <div key={recording.id} className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-base font-semibold">{recording.filename}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">
                        v{recording.version} · uploaded by {recording.uploadedBy.name} · {formatDate(recording.createdAt)}
                      </p>
                    </div>
                    <span className={`status-pill ${recordingTone(recording.status)}`}>{recording.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    {recording.canonicalTests.length > 0 ? (
                      recording.canonicalTests.map((item) => (
                        <span key={item.id} className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                          {item.name} · {item.status}
                        </span>
                      ))
                    ) : (
                      <span className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Awaiting canonical test</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2 className="section-title text-2xl font-semibold">Canonical tests</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="status-pill">{autoRepairedCount} auto repaired</span>
            <span className="status-pill">{validatingCount} repairing/validating</span>
            <span className="border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.08)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--danger)]">
              {needsHumanReviewCount} need human review
            </span>
          </div>
        </div>

        <form
          className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.55fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const nextQuery = { ...testDraft, page: 1 };
            setTestDraft(nextQuery);
            void refreshData(recordingQuery, nextQuery);
          }}
        >
          <input
            className="form-input"
            placeholder="Search canonical test name"
            type="search"
            value={testDraft.search}
            onChange={(event) => setTestDraft((current) => ({ ...current, search: event.target.value }))}
          />
          <select
            className="form-input"
            value={testDraft.status}
            onChange={(event) =>
              setTestDraft((current) => ({
                ...current,
                status: event.target.value as TestQuery['status'],
              }))
            }
          >
            {TEST_STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            placeholder="Filter by tag"
            type="search"
            value={testDraft.tag}
            onChange={(event) => setTestDraft((current) => ({ ...current, tag: event.target.value }))}
          />
          <select
            className="form-input"
            value={testDraft.pageSize}
            onChange={(event) =>
              setTestDraft((current) => ({
                ...current,
                pageSize: Number(event.target.value),
              }))
            }
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            Apply
          </button>
        </form>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{describeRange(testResult)}</span>
          <div className="flex items-center gap-2">
            <button
              className="secondary-button"
              disabled={testQuery.page <= 1}
              type="button"
              onClick={() => {
                const nextQuery = { ...testQuery, page: testQuery.page - 1 };
                setTestDraft(nextQuery);
                void refreshData(recordingQuery, nextQuery);
              }}
            >
              Previous
            </button>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">
              Page {testResult.page}
            </span>
            <button
              className="secondary-button"
              disabled={!testResult.hasMore}
              type="button"
              onClick={() => {
                const nextQuery = { ...testQuery, page: testQuery.page + 1 };
                setTestDraft(nextQuery);
                void refreshData(recordingQuery, nextQuery);
              }}
            >
              Next
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {tests.length === 0 ? (
            <div className="empty-state min-h-[8rem]">
              Canonical tests will appear here after recording ingestion completes.
            </div>
          ) : (
            tests.map((item) => (
              <article key={item.id} className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold">{item.name}</h3>
                      <span className={`status-pill ${testTone(item.status)}`}>{item.status}</span>
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">
                      {item.recordingAsset.filename} · canonical v{item.canonicalVersion} · {summarizeDefinition(item.definitionJson)}
                    </p>
                    {item.description ? <p className="text-sm text-[var(--muted)]">{item.description}</p> : null}
                    {item.status === 'NEEDS_HUMAN_REVIEW' ? (
                      <p className="border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.08)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
                        Automated repair could not recover this test. Human review is required.
                      </p>
                    ) : null}
                    {item.status === 'AUTO_REPAIRED' ? (
                      <p className="border border-[rgba(22,163,74,0.14)] bg-[rgba(22,163,74,0.08)] px-3 py-2 text-sm font-medium text-[var(--success)]">
                        This test passed after an automatic repair cycle.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-3 text-right">
                    <div className="text-sm text-[var(--muted)]">Updated {formatDate(item.updatedAt)}</div>
                    <Link
                      className="text-sm font-medium text-[var(--brand)] underline-offset-4 hover:underline"
                      href={`/app/${workspaceId}/tests/${item.id}`}
                    >
                      Open detail
                    </Link>
                    {canManage ? (
                      <button
                        className="secondary-button"
                        disabled={generatingTestId === item.id || item.status === 'ARCHIVED'}
                        type="button"
                        onClick={() => void generateTest(item.id)}
                      >
                        {generatingTestId === item.id ? 'Generating...' : item.generatedArtifacts[0] ? 'Regenerate' : 'Generate'}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.tagsJson.length > 0 ? (
                    item.tagsJson.map((tag) => (
                      <span key={tag} className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--brand)]">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">
                      Untagged
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  {item.generatedArtifacts.length > 0 ? (
                    item.generatedArtifacts.slice(0, 2).map((artifact) => (
                      <span key={artifact.id} className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                        Artifact v{artifact.version} · {artifact.status}
                      </span>
                    ))
                  ) : (
                    <span className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">
                      No generated Playwright artifact yet
                    </span>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
