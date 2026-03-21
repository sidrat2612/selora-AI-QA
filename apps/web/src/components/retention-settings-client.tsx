'use client';

import { useState } from 'react';
import { buildApiUrl, parseApiResponse, retentionSchema } from '@/lib/api';
import type { RetentionSetting } from '@/lib/types';

export function RetentionSettingsClient({
  workspaceId,
  initialRetention,
  canManage,
}: {
  workspaceId: string;
  initialRetention: RetentionSetting;
  canManage: boolean;
}) {
  const [retention, setRetention] = useState(initialRetention);
  const [formValues, setFormValues] = useState({
    logsDays: initialRetention.logsDays,
    screenshotsDays: initialRetention.screenshotsDays,
    videosDays: initialRetention.videosDays,
    tracesDays: initialRetention.tracesDays,
    auditDays: initialRetention.auditDays,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retentionFields = [
    ['logsDays', 'Logs'],
    ['screenshotsDays', 'Screenshots'],
    ['videosDays', 'Videos'],
    ['tracesDays', 'Traces'],
    ['auditDays', 'Audit'],
  ] as const;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const result = retentionSchema.safeParse(formValues);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Retention settings are invalid.');
      return;
    }

    const previous = retention;
    setError(null);
    setMessage(null);
    setRetention((current) => ({ ...current, ...result.data }));

    try {
      const updated = await parseApiResponse<RetentionSetting>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/settings/retention`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(result.data),
        }),
      );

      setRetention(updated);
      setFormValues({
        logsDays: updated.logsDays,
        screenshotsDays: updated.screenshotsDays,
        videosDays: updated.videosDays,
        tracesDays: updated.tracesDays,
        auditDays: updated.auditDays,
      });
      setMessage('Retention settings saved.');
    } catch (submitError) {
      setRetention(previous);
      setError(submitError instanceof Error ? submitError.message : 'Unable to update retention.');
    }
  }

  return (
    <div className="glass-panel rounded-none p-6">
      <div className="mb-6">
        <p className="eyebrow">Retention</p>
        <h2 className="section-title text-2xl font-semibold">Artifact lifetimes</h2>
      </div>

      <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        {retentionFields.map(([field, label]) => (
          <label key={field} className="space-y-2 text-sm font-medium text-[var(--muted)]">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{label} retention (days)</span>
            <input
              className="form-input"
              disabled={!canManage}
              type="number"
              value={formValues[field as keyof typeof formValues]}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  [field]: Number(event.target.value),
                }))
              }
            />
          </label>
        ))}

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          {canManage ? <button className="primary-button" type="submit">Save retention policy</button> : null}
          {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>
      </form>

      <p className="mt-5 text-sm text-[var(--muted)]">
        Current policy: logs {retention.logsDays}d, screenshots {retention.screenshotsDays}d, videos {retention.videosDays}d, traces {retention.tracesDays}d, audit {retention.auditDays}d.
      </p>
    </div>
  );
}