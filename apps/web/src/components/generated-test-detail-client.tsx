'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { CanonicalTestDetail, GeneratedArtifactDetail, RepairAttemptSummary } from '@/lib/types';

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function readValidation(record: Record<string, unknown> | null | undefined) {
  const validation = record?.['validation'];
  return typeof validation === 'object' && validation !== null
    ? (validation as Record<string, unknown>)
    : null;
}

function readFailureContext(record: Record<string, unknown> | null | undefined) {
  const validation = readValidation(record);
  const failureContext = validation?.['failureContext'];
  return typeof failureContext === 'object' && failureContext !== null
    ? (failureContext as Record<string, unknown>)
    : null;
}

export function GeneratedTestDetailClient({
  workspaceId,
  canManage,
  repairAttempts,
  test,
  selectedArtifact,
}: {
  workspaceId: string;
  canManage: boolean;
  repairAttempts: RepairAttemptSummary[];
  test: CanonicalTestDetail;
  selectedArtifact: GeneratedArtifactDetail | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedArtifact || (selectedArtifact.status !== 'VALIDATING' && test.status !== 'GENERATED' && test.status !== 'VALIDATING')) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [router, selectedArtifact, test.status]);

  async function generate() {
    if (!canManage) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await parseApiResponse<{ artifactId: string; queued: boolean; summary: string }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/tests/${test.id}/generate`), {
          method: 'POST',
          credentials: 'include',
        }),
      );

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set('artifact', result.artifactId);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      setMessage(result.summary);
      router.refresh();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate Playwright test.');
    } finally {
      setSubmitting(false);
    }
  }

  const failureContext = readFailureContext(selectedArtifact?.metadataJson ?? null);
  const validation = readValidation(selectedArtifact?.metadataJson ?? null);
  const needsHumanReview = test.status === 'NEEDS_HUMAN_REVIEW';
  const autoRepaired = test.status === 'AUTO_REPAIRED';
  const statusTone =
    test.status === 'AUTO_REPAIRED' || test.status === 'VALIDATED'
      ? 'text-[var(--success)]'
      : test.status === 'NEEDS_HUMAN_REVIEW'
        ? 'text-[var(--danger)]'
        : 'text-[#f59e0b]';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand)] underline-offset-4 hover:underline"
            href={`/app/${workspaceId}/tests`}
          >
            Back to catalog
          </Link>
          <p className="eyebrow">Sprint 4</p>
          <h1 className="section-title text-4xl font-semibold">{test.name}</h1>
          <p className="max-w-3xl text-[var(--muted)]">
            Review generated Playwright artifacts, validation outcomes, repair attempts, and escalation state for this canonical test.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`status-pill ${statusTone}`}>{test.status}</span>
          {canManage ? (
            <button className="primary-button" disabled={submitting} type="button" onClick={() => void generate()}>
              {submitting ? 'Generating...' : test.generatedArtifacts.length > 0 ? 'Regenerate test' : 'Generate test'}
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {needsHumanReview ? (
        <div className="rounded-none border border-[rgba(220,38,38,0.24)] bg-[rgba(220,38,38,0.08)] p-4 text-sm text-[var(--danger)]">
          Automated repair attempts were exhausted or the failure was not eligible for repair. Review the repair history and regenerate or fix the test manually.
        </div>
      ) : null}
      {autoRepaired ? (
        <div className="rounded-none border border-[rgba(22,163,74,0.22)] bg-[rgba(22,163,74,0.08)] p-4 text-sm text-[var(--success)]">
          This test was automatically repaired and passed revalidation. Review the stored diff below before using it in broader execution flows.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Canonical</p>
            <h2 className="section-title text-2xl font-semibold">Test context</h2>
          </div>

          <div className="space-y-4 text-sm text-[var(--muted)]">
            <p>{test.description ?? 'No description provided.'}</p>
            <p>
              Source recording: <span className="font-medium text-[var(--text)]">{test.recordingAsset.filename}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {test.tagsJson.length > 0 ? test.tagsJson.map((tag) => (
                <span key={tag} className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--brand)]">
                  {tag}
                </span>
              )) : <span className="border border-[var(--line)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Untagged</span>}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-none p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <span className="text-sm text-[var(--muted)]">{test.generatedArtifacts.length} total</span>
          </div>

          {test.generatedArtifacts.length > 0 ? (
            <div className="space-y-4">
              <label className="space-y-2 text-sm font-medium text-[var(--text)]">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Selected version</span>
                <select
                  className="form-input"
                  value={selectedArtifact?.id ?? test.generatedArtifacts[0]?.id ?? ''}
                  onChange={(event) => {
                    const nextParams = new URLSearchParams(searchParams.toString());
                    nextParams.set('artifact', event.target.value);
                    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
                  }}
                >
                  {test.generatedArtifacts.map((artifact) => (
                    <option key={artifact.id} value={artifact.id}>
                      v{artifact.version} · {artifact.status}
                    </option>
                  ))}
                </select>
              </label>

              {selectedArtifact ? (
                <div className="space-y-3 rounded-none border border-[var(--line)] bg-[var(--bg)] p-4 text-sm text-[var(--muted)]">
                  <p>
                    <span className="font-medium text-[var(--text)]">{selectedArtifact.fileName}</span>
                  </p>
                  <p>Status: <span className="status-pill ml-2">{selectedArtifact.status}</span></p>
                  <p>Generated: {formatDate(selectedArtifact.createdAt)}</p>
                  <p>Validation started: {formatDate(selectedArtifact.validationStartedAt)}</p>
                  <p>Validated: {formatDate(selectedArtifact.validatedAt)}</p>
                  {validation?.['summary'] ? <p>Summary: {String(validation['summary'])}</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">No generated artifacts yet.</div>
          )}
        </section>
      </div>

      {selectedArtifact ? (
        <>
          <section className="glass-panel rounded-none p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Code</p>
                <h2 className="section-title text-2xl font-semibold">Generated Playwright test</h2>
              </div>
              <span className="text-sm text-[var(--muted)]">Generator {selectedArtifact.generatorVersion ?? 'unknown'}</span>
            </div>
            <pre className="overflow-x-auto rounded-none border border-[var(--line)] bg-[rgba(15,23,42,0.94)] p-5 text-sm leading-6 text-slate-100">
              <code>{selectedArtifact.code}</code>
            </pre>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="glass-panel rounded-none p-6">
              <div className="mb-5 space-y-2">
                <p className="eyebrow">Validation</p>
                <h2 className="section-title text-2xl font-semibold">Failure context</h2>
              </div>
              {failureContext ? (
                <dl className="space-y-3 text-sm text-[var(--muted)]">
                  <div>
                    <dt className="font-medium text-[var(--text)]">Error class</dt>
                    <dd>{String(failureContext['errorClass'] ?? 'Unknown')}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--text)]">Message</dt>
                    <dd>{String(failureContext['message'] ?? 'No failure message captured.')}</dd>
                  </div>
                  {failureContext['failingStep'] ? (
                    <div>
                      <dt className="font-medium text-[var(--text)]">Failing step</dt>
                      <dd>{String(failureContext['failingStep'])}</dd>
                    </div>
                  ) : null}
                  {failureContext['stackSummary'] ? (
                    <div>
                      <dt className="font-medium text-[var(--text)]">Stack summary</dt>
                      <dd className="whitespace-pre-wrap break-words">{String(failureContext['stackSummary'])}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <div className="empty-state min-h-[10rem]">No validation failure context captured for this artifact.</div>
              )}
            </div>

            <div className="glass-panel rounded-none p-6">
              <div className="mb-5 space-y-2">
                <p className="eyebrow">Artifacts</p>
                <h2 className="section-title text-2xl font-semibold">Failure captures</h2>
              </div>
              {selectedArtifact.artifacts.length > 0 ? (
                <div className="space-y-3">
                  {selectedArtifact.artifacts.map((artifact) => (
                    <a
                      key={artifact.id}
                      className="flex items-center justify-between border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] hover:bg-white"
                      href={buildApiUrl(`/workspaces/${workspaceId}/tests/${test.id}/generated-artifacts/${selectedArtifact.id}/artifacts/${artifact.id}/download`)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span>{artifact.fileName}</span>
                      <span className="text-[var(--muted)]">{artifact.artifactType}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-state min-h-[10rem]">No screenshot, trace, or video artifacts stored for this version.</div>
              )}
            </div>
          </section>

          <section className="glass-panel rounded-none p-6">
            <div className="mb-5 space-y-2">
              <p className="eyebrow">Repair</p>
              <h2 className="section-title text-2xl font-semibold">Repair history</h2>
            </div>

            {repairAttempts.length > 0 ? (
              <div className="space-y-4">
                {repairAttempts.map((attempt) => (
                  <article
                    key={attempt.id}
                    className="space-y-4 rounded-none border border-[var(--line)] bg-[var(--bg)] p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2 text-sm text-[var(--muted)]">
                        <p className="font-medium text-[var(--text)]">
                          Attempt {attempt.attemptNumber} · {attempt.repairMode}
                        </p>
                        <p>
                          Status: <span className="status-pill ml-2">{attempt.status}</span>
                        </p>
                        <p>Source artifact: v{attempt.generatedTestArtifact.version} · {attempt.generatedTestArtifact.fileName}</p>
                        <p>Started: {formatDate(attempt.startedAt)}</p>
                        <p>Finished: {formatDate(attempt.finishedAt)}</p>
                        <p>Prompt version: {attempt.promptVersion}</p>
                        {attempt.modelName ? <p>Model: {attempt.modelName}</p> : null}
                        {attempt.diffSummary ? <p>{attempt.diffSummary}</p> : null}
                      </div>
                      {attempt.patchArtifact ? (
                        <a
                          className="secondary-button"
                          href={buildApiUrl(`/workspaces/${workspaceId}/tests/${test.id}/generated-artifacts/${attempt.generatedTestArtifact.id}/artifacts/${attempt.patchArtifact.id}/download`)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Download diff
                        </a>
                      ) : null}
                    </div>

                    {attempt.patchText ? (
                      <pre className="overflow-x-auto rounded-none border border-[var(--line)] bg-[rgba(15,23,42,0.94)] p-4 text-xs leading-6 text-slate-100">
                        <code>{attempt.patchText}</code>
                      </pre>
                    ) : (
                      <div className="empty-state min-h-[6rem]">No patch diff stored for this repair attempt.</div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">No repair attempts have been recorded for this test yet.</div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}