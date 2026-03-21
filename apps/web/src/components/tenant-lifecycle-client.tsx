'use client';

import { startTransition, useMemo, useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { TenantLifecycleSummary } from '@/lib/types';

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusTone(status: TenantLifecycleSummary['status']) {
  switch (status) {
    case 'SUSPENDED':
      return 'border border-[rgba(245,158,11,0.14)] bg-[rgba(245,158,11,0.08)] text-[rgb(161,98,7)]';
    case 'ARCHIVED':
      return 'border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)]';
    default:
      return 'border border-[rgba(22,163,74,0.14)] bg-[rgba(22,163,74,0.08)] text-[var(--success)]';
  }
}

export function TenantLifecycleClient({
  workspaceId,
  tenantId,
  initialTenant,
  canManage,
}: {
  workspaceId: string;
  tenantId: string;
  initialTenant: TenantLifecycleSummary;
  canManage: boolean;
}) {
  const [tenant, setTenant] = useState(initialTenant);
  const [graceDays, setGraceDays] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const tenantExportUrl = useMemo(() => buildApiUrl(`/tenants/${tenantId}/export`), [tenantId]);
  const workspaceExportUrl = useMemo(
    () => buildApiUrl(`/tenants/${tenantId}/export?workspaceId=${workspaceId}`),
    [tenantId, workspaceId],
  );

  async function submitLifecycleUpdate(payload: Record<string, unknown>, successText: string) {
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await parseApiResponse<TenantLifecycleSummary>(
        await fetch(buildApiUrl(`/tenants/${tenantId}`), {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
      );

      startTransition(() => setTenant(updated));
      setSuccessMessage(successText);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update tenant lifecycle.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Tenant lifecycle</p>
            <h2 className="section-title text-2xl font-semibold">Operational status and recovery window</h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Suspend or archive the tenant, request a soft-delete grace period, and export tenant-scoped operational data without exposing environment secret material.
            </p>
          </div>
          <span className={`px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(tenant.status)}`}>{tenant.status}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Workspaces</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{tenant.counts.workspaces}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{tenant.counts.activeWorkspaces} active</p>
          </article>
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Member seats</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{tenant.counts.memberSeats}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Distinct tenant members</p>
          </article>
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Execution history</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{tenant.counts.runs}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{tenant.counts.recordings} recordings stored</p>
          </article>
          <article className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Artifacts and audit</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{tenant.counts.generatedArtifacts}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{tenant.counts.auditEvents} audit events</p>
          </article>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--text)]">Status timestamps</p>
            <dl className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <dt>Suspended at</dt>
                <dd className="text-right text-[var(--text)]">{formatTimestamp(tenant.suspendedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Archived at</dt>
                <dd className="text-right text-[var(--text)]">{formatTimestamp(tenant.archivedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Soft-delete requested</dt>
                <dd className="text-right text-[var(--text)]">{formatTimestamp(tenant.softDeleteRequestedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Soft-delete scheduled for</dt>
                <dd className="text-right text-[var(--text)]">{formatTimestamp(tenant.softDeleteScheduledFor)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--text)]">Included workspaces</p>
            <div className="mt-4 space-y-3">
              {tenant.workspaces.map((workspace) => (
                <div key={workspace.id} className="flex items-center justify-between gap-4 border border-[var(--line)] px-4 py-3">
                  <div>
                    <div className="font-medium text-[var(--text)]">{workspace.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#999999]">/{workspace.slug}</div>
                  </div>
                  <span className="status-pill">{workspace.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Management</p>
            <h2 className="section-title text-2xl font-semibold">Tenant controls</h2>
          </div>
          <span className="status-pill">{canManage ? 'Editable' : 'Read-only'}</span>
        </div>

        {canManage ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3">
              <button className="primary-button" disabled={saving || tenant.status === 'ACTIVE'} onClick={() => submitLifecycleUpdate({ status: 'ACTIVE' }, 'Tenant reactivated. Mutating operations are available again.')} type="button">
                Activate tenant
              </button>
              <button className="secondary-button" disabled={saving || tenant.status === 'SUSPENDED'} onClick={() => submitLifecycleUpdate({ status: 'SUSPENDED' }, 'Tenant suspended. Mutating operations are now blocked.')} type="button">
                Suspend tenant
              </button>
              <button className="secondary-button" disabled={saving || tenant.status === 'ARCHIVED'} onClick={() => submitLifecycleUpdate({ status: 'ARCHIVED' }, 'Tenant archived. Mutating operations are now blocked.')} type="button">
                Archive tenant
              </button>
            </div>

            <div className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5">
              <div className="flex flex-wrap items-end gap-4">
                <label className="block max-w-[220px] flex-1">
                  <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Soft-delete grace period</span>
                  <input
                    className="form-input"
                    inputMode="numeric"
                    min="1"
                    max="90"
                    type="number"
                    value={graceDays}
                    onChange={(event) => setGraceDays(event.target.value)}
                  />
                </label>
                <button className="secondary-button" disabled={saving} onClick={() => submitLifecycleUpdate({ softDeleteAction: 'REQUEST', softDeleteGraceDays: Number(graceDays) }, 'Soft-delete requested. Tenant is archived and a recovery window is now active.')} type="button">
                  Request soft-delete
                </button>
                <button className="secondary-button" disabled={saving || !tenant.softDeleteRequestedAt} onClick={() => submitLifecycleUpdate({ softDeleteAction: 'CANCEL' }, 'Soft-delete canceled. Tenant returned to active status.')} type="button">
                  Cancel soft-delete
                </button>
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Soft-delete marks the tenant for cleanup later. In the local-Docker workflow, cleanup remains manual and documented in the runbooks.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">View-only access — lifecycle changes and export requests are disabled for your current role.</p>
        )}

        {successMessage ? <p className="mt-4 text-sm text-[var(--success)]">{successMessage}</p> : null}
        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      </section>

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Export</p>
            <h2 className="section-title text-2xl font-semibold">Portable JSON archives</h2>
          </div>
          <span className="status-pill">Secrets excluded</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <a className="glass-panel rounded-none p-5 transition hover:translate-y-[-2px]" href={tenantExportUrl}>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Export full tenant</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Includes workspaces, memberships, environments, recordings, tests, runs, repair attempts, artifact metadata, quotas, usage, and audit events.
            </p>
          </a>
          <a className="glass-panel rounded-none p-5 transition hover:translate-y-[-2px]" href={workspaceExportUrl}>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Export current workspace slice</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Limits the export to the current workspace while keeping tenant context and tenant-level quota metadata.
            </p>
          </a>
        </div>
      </section>
    </div>
  );
}