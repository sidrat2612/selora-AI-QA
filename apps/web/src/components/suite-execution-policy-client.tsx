'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { AutomationSuiteDetail, ExecutionSourceMode } from '@/lib/types';

const SOURCE_MODE_OPTIONS: Array<{ value: ExecutionSourceMode; label: string; description: string }> = [
  {
    value: 'STORAGE_ARTIFACT',
    label: 'Storage artifact',
    description: 'Run the version already stored in Selora. This stays fully local and predictable.',
  },
  {
    value: 'PINNED_COMMIT',
    label: 'Pinned commit',
    description: 'Resolve a concrete Git commit before queueing and keep every run anchored to that SHA.',
  },
  {
    value: 'BRANCH_HEAD',
    label: 'Branch head',
    description: 'Resolve the latest branch commit before queueing. This is useful for fast verification but less stable.',
  },
];

export function SuiteExecutionPolicyClient({
  workspaceId,
  suite,
  canManage,
}: {
  workspaceId: string;
  suite: AutomationSuiteDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [formState, setFormState] = useState(suite.executionPolicy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await parseApiResponse<AutomationSuiteDetail>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}`), {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            executionSourcePolicy: formState.defaultMode,
            allowBranchHeadExecution: formState.allowBranchHeadExecution,
            allowStorageExecutionFallback: formState.allowStorageExecutionFallback,
          }),
        }),
      );

      startTransition(() => {
        setFormState(updated.executionPolicy);
        router.refresh();
      });
      setSuccessMessage('Execution source policy saved for this suite. New runs will resolve sources with this policy immediately.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save suite execution policy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-panel rounded-none p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Execution lineage</p>
          <h3 className="text-xl font-semibold">Suite source policy</h3>
        </div>
        <span className="status-pill">{canManage ? 'Editable' : 'Read-only'}</span>
      </div>

      <div className="space-y-3 text-sm text-[var(--muted)]">
        <div className="border border-[var(--line)] bg-white p-4">
          Selora now resolves each run item to a concrete source before worker startup. The policy below defines the default source mode for this suite.
        </div>
        <div className="border border-[var(--line)] bg-white p-4">
          Branch-head execution stays explicitly gated, and storage fallback keeps the current storage-backed baseline available when Git resolution breaks.
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={savePolicy}>
        <label className="block rounded-none border border-[var(--line)] bg-white p-4">
          <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Default source mode</span>
          <select
            className="form-input"
            disabled={!canManage || saving}
            value={formState.defaultMode}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                defaultMode: event.target.value as ExecutionSourceMode,
              }))
            }
          >
            {SOURCE_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-[var(--muted)]">
            {SOURCE_MODE_OPTIONS.find((option) => option.value === formState.defaultMode)?.description}
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-none border border-[var(--line)] bg-white p-4">
          <input
            checked={formState.allowBranchHeadExecution}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            disabled={!canManage || saving}
            type="checkbox"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                allowBranchHeadExecution: event.target.checked,
              }))
            }
          />
          <span>
            <span className="block font-medium text-[var(--text)]">Allow branch-head execution requests</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">
              When disabled, operators cannot request the latest branch head for this suite even if GitHub is connected.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-none border border-[var(--line)] bg-white p-4">
          <input
            checked={formState.allowStorageExecutionFallback}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            disabled={!canManage || saving}
            type="checkbox"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                allowStorageExecutionFallback: event.target.checked,
              }))
            }
          />
          <span>
            <span className="block font-medium text-[var(--text)]">Allow storage fallback</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">
              If Git resolution fails, Selora falls back to the stored artifact instead of rejecting the run request.
            </span>
          </span>
        </label>

        {canManage ? (
          <div className="flex items-center gap-3">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? 'Saving...' : 'Save source policy'}
            </button>
            {successMessage ? <span className="text-sm text-[var(--success)]">{successMessage}</span> : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </form>
    </section>
  );
}