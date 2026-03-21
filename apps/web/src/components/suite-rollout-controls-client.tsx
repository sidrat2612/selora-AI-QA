'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { AutomationSuiteDetail, RolloutStage } from '@/lib/types';

const STAGE_OPTIONS: Array<{ value: RolloutStage; label: string; description: string }> = [
  {
    value: 'INTERNAL',
    label: 'Internal',
    description: 'Keep the suite in controlled internal use while rollout settings are still being validated.',
  },
  {
    value: 'PILOT',
    label: 'Pilot',
    description: 'Enable the suite for a limited cohort while watching audit exports, webhook health, and sync failures.',
  },
  {
    value: 'GENERAL',
    label: 'General',
    description: 'The suite is ready for broad operator use and should have all intended controls settled.',
  },
];

export function SuiteRolloutControlsClient({
  workspaceId,
  suite,
  canManage,
}: {
  workspaceId: string;
  suite: AutomationSuiteDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [formState, setFormState] = useState(suite.rollout);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function saveRollout(event: React.FormEvent<HTMLFormElement>) {
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
            rolloutStage: formState.stage,
            githubPublishingEnabled: formState.githubPublishingEnabled,
            gitExecutionEnabled: formState.gitExecutionEnabled,
            testRailSyncEnabled: formState.testRailSyncEnabled,
          }),
        }),
      );

      startTransition(() => {
        setFormState(updated.rollout);
        router.refresh();
      });
      setSuccessMessage('Rollout controls saved for this suite. New operator actions will use these gates immediately.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save rollout controls.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-panel rounded-none p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Rollout</p>
          <h3 className="text-xl font-semibold">Suite rollout controls</h3>
        </div>
        <span className="status-pill">{formState.stage}</span>
      </div>

      <div className="space-y-3 text-sm text-[var(--muted)]">
        <div className="border border-[var(--line)] bg-white p-4">
          Sprint 6 adds suite-scoped rollout gates so external publication, Git-backed execution, and TestRail synchronization can be enabled independently.
        </div>
        <div className="border border-[var(--line)] bg-white p-4">
          Use the stage to communicate operator readiness, then use the toggles below to control which capabilities are actually live for this suite.
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={saveRollout}>
        <label className="block rounded-none border border-[var(--line)] bg-white p-4">
          <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Rollout stage</span>
          <select
            className="form-input"
            disabled={!canManage || saving}
            value={formState.stage}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                stage: event.target.value as RolloutStage,
              }))
            }
          >
            {STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-[var(--muted)]">
            {STAGE_OPTIONS.find((option) => option.value === formState.stage)?.description}
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-none border border-[var(--line)] bg-white p-4">
          <input
            checked={formState.githubPublishingEnabled}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            disabled={!canManage || saving}
            type="checkbox"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                githubPublishingEnabled: event.target.checked,
              }))
            }
          />
          <span>
            <span className="block font-medium text-[var(--text)]">Enable GitHub publication and replay</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">
              Controls publish actions for READY artifacts and replay of failed webhook reconciliations.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-none border border-[var(--line)] bg-white p-4">
          <input
            checked={formState.gitExecutionEnabled}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            disabled={!canManage || saving}
            type="checkbox"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                gitExecutionEnabled: event.target.checked,
              }))
            }
          />
          <span>
            <span className="block font-medium text-[var(--text)]">Enable Git-backed execution</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">
              Controls pinned-commit and branch-head execution. Storage-backed runs remain available when suite policy allows fallback.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-none border border-[var(--line)] bg-white p-4">
          <input
            checked={formState.testRailSyncEnabled}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            disabled={!canManage || saving}
            type="checkbox"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                testRailSyncEnabled: event.target.checked,
              }))
            }
          />
          <span>
            <span className="block font-medium text-[var(--text)]">Enable TestRail sync and retry</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">
              Controls suite sync runs and individual case retry actions without blocking integration configuration or manual mapping.
            </span>
          </span>
        </label>

        {canManage ? (
          <div className="flex items-center gap-3">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? 'Saving...' : 'Save rollout controls'}
            </button>
            {successMessage ? <span className="text-sm text-[var(--success)]">{successMessage}</span> : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </form>
    </section>
  );
}