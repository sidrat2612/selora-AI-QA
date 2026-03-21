'use client';

import { startTransition, useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { Workspace } from '@/lib/types';

export function WorkspaceRunControlsClient({
  workspaceId,
  initialWorkspace,
  canManage,
}: {
  workspaceId: string;
  initialWorkspace: Workspace;
  canManage: boolean;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [formState, setFormState] = useState({
    concurrentExecutionLimit: initialWorkspace.concurrentExecutionLimit,
    maxTestsPerRun: initialWorkspace.maxTestsPerRun,
    runCooldownSeconds: initialWorkspace.runCooldownSeconds,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    if (formState.concurrentExecutionLimit < 1 || formState.maxTestsPerRun < 1 || formState.runCooldownSeconds < 0) {
      setError('Execution controls must use positive limits and a non-negative cooldown.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await parseApiResponse<Workspace>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/settings`), {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formState),
        }),
      );

      startTransition(() => {
        setWorkspace(updated);
        setFormState({
          concurrentExecutionLimit: updated.concurrentExecutionLimit,
          maxTestsPerRun: updated.maxTestsPerRun,
          runCooldownSeconds: updated.runCooldownSeconds,
        });
      });
      setSuccessMessage('Execution controls saved. New run requests use these limits immediately.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save workspace execution controls.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 space-y-2">
          <p className="eyebrow">Sprint 9 kickoff</p>
          <h2 className="section-title text-2xl font-semibold">Execution abuse controls</h2>
          <p className="max-w-3xl text-sm text-[var(--muted)]">
            This Sprint 9 slice hardens run creation for the current local Docker deployment. It limits concurrent runs, caps the number of tests in a single run, and enforces an optional cooldown between workspace runs.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Concurrent runs</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{workspace.concurrentExecutionLimit}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Maximum queued or running runs allowed at once.</p>
          </article>
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Tests per run</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{workspace.maxTestsPerRun}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Hard cap for how many canonical tests may be launched together.</p>
          </article>
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Run cooldown</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{workspace.runCooldownSeconds}s</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Minimum delay after a run before another can be started.</p>
          </article>
        </div>
      </section>

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Settings</p>
            <h2 className="section-title text-2xl font-semibold">Workspace run limits</h2>
          </div>
          <span className="status-pill">{canManage ? 'Editable' : 'Read-only'}</span>
        </div>

        {canManage ? (
          <form className="grid gap-4 md:grid-cols-3" onSubmit={saveSettings}>
            <label className="block rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
              <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Concurrent execution limit</span>
              <input
                className="form-input"
                min={1}
                type="number"
                value={formState.concurrentExecutionLimit}
                onChange={(event) => setFormState((current) => ({ ...current, concurrentExecutionLimit: Number(event.target.value) || 0 }))}
              />
              <span className="mt-2 block text-xs text-[var(--muted)]">Applies to queued and running runs.</span>
            </label>

            <label className="block rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
              <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Max tests per run</span>
              <input
                className="form-input"
                min={1}
                type="number"
                value={formState.maxTestsPerRun}
                onChange={(event) => setFormState((current) => ({ ...current, maxTestsPerRun: Number(event.target.value) || 0 }))}
              />
              <span className="mt-2 block text-xs text-[var(--muted)]">Oversized run requests are rejected before queueing.</span>
            </label>

            <label className="block rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
              <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Run cooldown seconds</span>
              <input
                className="form-input"
                min={0}
                type="number"
                value={formState.runCooldownSeconds}
                onChange={(event) => setFormState((current) => ({ ...current, runCooldownSeconds: Number(event.target.value) || 0 }))}
              />
              <span className="mt-2 block text-xs text-[var(--muted)]">Set to 0 to disable run throttling for the workspace.</span>
            </label>

            <div className="md:col-span-3 flex items-center gap-3">
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? 'Saving...' : 'Save execution controls'}
              </button>
              {successMessage ? <span className="text-sm text-[var(--success)]">{successMessage}</span> : null}
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">Workspace operators and admins can edit execution controls. Your current role can only review them.</p>
        )}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      </section>
    </div>
  );
}