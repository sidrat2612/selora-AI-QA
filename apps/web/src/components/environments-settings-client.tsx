'use client';

import { startTransition, useState } from 'react';
import { buildApiUrl, environmentSchema, parseApiResponse } from '@/lib/api';
import type { Environment } from '@/lib/types';

export function EnvironmentsSettingsClient({
  workspaceId,
  initialEnvironments,
  canManage,
}: {
  workspaceId: string;
  initialEnvironments: Environment[];
  canManage: boolean;
}) {
  const [environments, setEnvironments] = useState(initialEnvironments);
  const [formState, setFormState] = useState({
    name: '',
    baseUrl: '',
    secretRef: '',
    secretValue: '',
    testTimeoutMs: 120000,
    runTimeoutMs: 3600000,
    maxRetries: 0,
    isDefault: false,
  });
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function createEnvironment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const result = environmentSchema.safeParse(formState);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Environment details are invalid.');
      return;
    }

    const tempEnvironment: Environment = {
      id: `temp-${Date.now()}`,
      workspaceId,
      name: result.data.name,
      baseUrl: result.data.baseUrl,
      secretRef: result.data.secretRef,
      isDefault: result.data.isDefault,
      status: 'ACTIVE',
      testTimeoutMs: result.data.testTimeoutMs,
      runTimeoutMs: result.data.runTimeoutMs,
      maxRetries: result.data.maxRetries,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const previous = environments;
    setError(null);
    setSubmitting(true);
    setEnvironments((current) => [tempEnvironment, ...current.map((item) => ({ ...item, isDefault: result.data.isDefault ? false : item.isDefault }))]);

    try {
      const endpoint = cloneSourceId
        ? `/workspaces/${workspaceId}/environments/${cloneSourceId}/clone`
        : `/workspaces/${workspaceId}/environments`;
      const created = await parseApiResponse<Environment>(
        await fetch(buildApiUrl(endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(
            cloneSourceId
              ? {
                  name: result.data.name,
                  secretRef: result.data.secretRef,
                  secretValue: result.data.secretValue || undefined,
                }
              : {
                  ...result.data,
                  secretValue: result.data.secretValue || undefined,
                },
          ),
        }),
      );

      startTransition(() => {
        setEnvironments((current) =>
          current.map((item) => {
            if (item.id === tempEnvironment.id) {
              return created;
            }
            return created.isDefault ? { ...item, isDefault: false } : item;
          }),
        );
      });

      setCloneSourceId(null);
      setFormState({
        name: '',
        baseUrl: '',
        secretRef: '',
        secretValue: '',
        testTimeoutMs: 120000,
        runTimeoutMs: 3600000,
        maxRetries: 0,
        isDefault: false,
      });
    } catch (submitError) {
      setEnvironments(previous);
      setError(submitError instanceof Error ? submitError.message : 'Unable to create environment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function setDefault(environmentId: string) {
    if (!canManage) {
      return;
    }

    const previous = environments;
    setEnvironments((current) => current.map((item) => ({ ...item, isDefault: item.id === environmentId })));

    try {
      const updated = await parseApiResponse<Environment>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/environments/${environmentId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isDefault: true }),
        }),
      );

      setEnvironments((current) => current.map((item) => ({ ...item, isDefault: item.id === updated.id })));
    } catch (submitError) {
      setEnvironments(previous);
      setError(submitError instanceof Error ? submitError.message : 'Unable to update default environment.');
    }
  }

  function prepareClone(environment: Environment) {
    setCloneSourceId(environment.id);
    setFormState({
      name: `${environment.name} Copy`,
      baseUrl: environment.baseUrl,
      secretRef: environment.secretRef,
      secretValue: '',
      testTimeoutMs: environment.testTimeoutMs,
      runTimeoutMs: environment.runTimeoutMs,
      maxRetries: environment.maxRetries,
      isDefault: false,
    });
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-none p-6">
        <div className="mb-5">
          <p className="eyebrow">Environments</p>
          <h2 className="section-title text-2xl font-semibold">Runtime targets</h2>
        </div>

        {canManage ? (
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createEnvironment}>
            {cloneSourceId ? (
              <div className="md:col-span-2 rounded-none border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--muted)]">
                Cloning from {environments.find((environment) => environment.id === cloneSourceId)?.name ?? 'selected environment'}.
                <button
                  className="secondary-button ml-3 !px-3 !py-1 text-xs"
                  type="button"
                  onClick={() => setCloneSourceId(null)}
                >
                  Cancel clone mode
                </button>
              </div>
            ) : null}
            <input className="form-input" placeholder="Name" value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} />
            <input className="form-input" placeholder="Base URL" value={formState.baseUrl} onChange={(event) => setFormState((current) => ({ ...current, baseUrl: event.target.value }))} />
            <input className="form-input md:col-span-2" placeholder="Secret reference" value={formState.secretRef} onChange={(event) => setFormState((current) => ({ ...current, secretRef: event.target.value }))} />
            <input className="form-input md:col-span-2" placeholder="Secret value (stored encrypted, optional)" type="password" value={formState.secretValue} onChange={(event) => setFormState((current) => ({ ...current, secretValue: event.target.value }))} />
            <input className="form-input" min={1} placeholder="Test timeout (ms)" type="number" value={formState.testTimeoutMs} onChange={(event) => setFormState((current) => ({ ...current, testTimeoutMs: Number(event.target.value) || 0 }))} />
            <input className="form-input" min={1} placeholder="Run timeout (ms)" type="number" value={formState.runTimeoutMs} onChange={(event) => setFormState((current) => ({ ...current, runTimeoutMs: Number(event.target.value) || 0 }))} />
            <input className="form-input" min={0} placeholder="Max retries" type="number" value={formState.maxRetries} onChange={(event) => setFormState((current) => ({ ...current, maxRetries: Number(event.target.value) || 0 }))} />
            <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <input checked={formState.isDefault} type="checkbox" onChange={(event) => setFormState((current) => ({ ...current, isDefault: event.target.checked }))} />
              Mark as default environment
            </label>
            <div className="md:col-span-2">
              <button className="primary-button" disabled={submitting} type="submit">
                {submitting ? 'Saving...' : cloneSourceId ? 'Clone environment' : 'Create environment'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">View-only access — environment changes are disabled.</p>
        )}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {environments.map((environment) => (
          <div key={environment.id} className="glass-panel rounded-none p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">{environment.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">{environment.baseUrl}</p>
              </div>
              {environment.isDefault ? <span className="status-pill">Default</span> : null}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Secret ref: {environment.secretRef}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Test timeout: {environment.testTimeoutMs} ms · Run timeout: {environment.runTimeoutMs} ms · Retries: {environment.maxRetries}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="status-pill">{environment.status}</span>
              {canManage ? (
                <div className="flex items-center gap-2">
                  {!environment.isDefault ? (
                    <button className="secondary-button" type="button" onClick={() => setDefault(environment.id)}>
                      Make default
                    </button>
                  ) : null}
                  <button className="secondary-button" type="button" onClick={() => prepareClone(environment)}>
                    Clone config
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}