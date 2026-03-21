'use client';

import { startTransition, useMemo, useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { MetricType, TenantQuotaOverview } from '@/lib/types';

function formatMetricValue(metricType: MetricType, value: number) {
  if (metricType === 'ARTIFACT_STORAGE_BYTES') {
    if (value < 1024) {
      return `${value.toFixed(0)} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    if (value < 1024 * 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  return new Intl.NumberFormat().format(Math.round(value));
}

function toneClasses(threshold: TenantQuotaOverview['metrics'][number]['threshold']) {
  switch (threshold) {
    case 'exceeded':
      return 'border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.08)] text-[var(--danger)]';
    case 'critical':
      return 'border border-[rgba(249,115,22,0.14)] bg-[rgba(249,115,22,0.08)] text-[rgb(194,65,12)]';
    case 'warning':
      return 'border border-[rgba(245,158,11,0.14)] bg-[rgba(245,158,11,0.08)] text-[rgb(161,98,7)]';
    case 'normal':
      return 'border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)]';
    default:
      return 'border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)]';
  }
}

function buildDraft(overview: TenantQuotaOverview) {
  return Object.fromEntries(
    overview.metrics.map((metric) => [metric.metricType, metric.limit === null ? '' : String(metric.limit)]),
  ) as Record<MetricType, string>;
}

export function QuotaSettingsClient({
  tenantId,
  initialOverview,
  canManage,
}: {
  tenantId: string;
  initialOverview: TenantQuotaOverview;
  canManage: boolean;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [draft, setDraft] = useState<Record<MetricType, string>>(() => buildDraft(initialOverview));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const metrics = useMemo(() => overview.metrics, [overview]);

  async function saveQuotas(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const limits = Object.fromEntries(
        metrics.map((metric) => {
          const value = draft[metric.metricType]?.trim() ?? '';
          return [metric.metricType, value === '' ? null : Number(value)];
        }),
      );

      const updated = await parseApiResponse<TenantQuotaOverview>(
        await fetch(buildApiUrl(`/tenants/${tenantId}/quotas`), {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ limits }),
        }),
      );

      startTransition(() => {
        setOverview(updated);
        setDraft(buildDraft(updated));
      });
      setSuccessMessage('Quota limits saved. Changes apply immediately to new requests.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update quotas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Tenant quotas</p>
            <h2 className="section-title text-2xl font-semibold">Usage and hard limits</h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Hard quotas are enforced for uploads, run creation, seat growth, and tenant-wide API request volume. Warning states begin at 80% usage and critical states begin at 90%.
            </p>
          </div>
          <span className="status-pill">{metrics.length} tracked metrics</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {metrics.map((metric) => {
            const width = metric.percentUsed === null ? 0 : Math.min(metric.percentUsed, 100);
            return (
              <article key={metric.metricType} className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{metric.label}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#999999]">{metric.metricType}</p>
                  </div>
                  <span className={`px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${toneClasses(metric.threshold)}`}>
                    {metric.threshold === 'unlimited' ? 'Unlimited' : metric.threshold}
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold text-[var(--text)]">{formatMetricValue(metric.metricType, metric.usage)}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {metric.limit === null
                        ? 'No hard limit configured'
                        : `${formatMetricValue(metric.metricType, metric.limit)} limit`}
                    </div>
                  </div>
                  <div className="text-right text-sm text-[var(--muted)]">
                    <div>{metric.percentUsed === null ? 'Unlimited' : `${metric.percentUsed}% used`}</div>
                    <div>
                      {metric.remaining === null
                        ? 'Remaining: unlimited'
                        : `Remaining: ${formatMetricValue(metric.metricType, metric.remaining)}`}
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden bg-[rgba(15,23,42,0.08)]">
                  <div
                    className={`h-full ${metric.threshold === 'exceeded' ? 'bg-[var(--danger)]' : metric.threshold === 'critical' ? 'bg-[rgb(249,115,22)]' : metric.threshold === 'warning' ? 'bg-[rgb(245,158,11)]' : 'bg-[var(--brand)]'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Management</p>
            <h2 className="section-title text-2xl font-semibold">Edit limits</h2>
          </div>
          <span className="status-pill">{canManage ? 'Editable' : 'Read-only'}</span>
        </div>

        {canManage ? (
          <form className="space-y-5" onSubmit={saveQuotas}>
            <div className="grid gap-4 md:grid-cols-2">
              {metrics.map((metric) => (
                <label key={metric.metricType} className="block rounded-none border border-[var(--line)] bg-[var(--bg)] p-4">
                  <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{metric.label}</span>
                  <input
                    className="form-input"
                    inputMode="decimal"
                    min="0"
                    placeholder="Leave blank for unlimited"
                    step="any"
                    type="number"
                    value={draft[metric.metricType] ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [metric.metricType]: event.target.value,
                      }))
                    }
                  />
                  <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Unit: {metric.unit}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? 'Saving...' : 'Save quota limits'}
              </button>
              {successMessage ? <span className="text-sm text-[var(--success)]">{successMessage}</span> : null}
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">View-only access — quota editing is disabled for your current role.</p>
        )}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      </section>
    </div>
  );
}