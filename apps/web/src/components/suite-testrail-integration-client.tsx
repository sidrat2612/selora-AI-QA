'use client';

import { startTransition, useState } from 'react';
import {
  buildApiUrl,
  parseApiResponse,
  testrailCaseLinkSchema,
  testrailIntegrationSchema,
} from '@/lib/api';
import type {
  AutomationSuiteDetail,
  ExternalTestCaseLinkSummary,
  TestRailSuiteIntegration,
} from '@/lib/types';

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function emptyFormState() {
  return {
    baseUrl: '',
    projectId: '',
    suiteIdExternal: '',
    sectionId: '',
    username: '',
    secretRef: '',
    apiKey: '',
    syncPolicy: 'MANUAL' as const,
  };
}

function toFormState(integration: TestRailSuiteIntegration | null) {
  if (!integration) {
    return emptyFormState();
  }

  return {
    baseUrl: integration.baseUrl,
    projectId: integration.projectId,
    suiteIdExternal: integration.suiteIdExternal ?? '',
    sectionId: integration.sectionId ?? '',
    username: integration.username,
    secretRef: integration.secretRef ?? '',
    apiKey: '',
    syncPolicy: integration.syncPolicy,
  };
}

function toLinkDraft(link: ExternalTestCaseLinkSummary | null) {
  return {
    externalCaseId: link?.externalCaseId ?? '',
    ownerEmail: link?.ownerEmail ?? '',
  };
}

function toLinkMap(suite: AutomationSuiteDetail) {
  return Object.fromEntries(
    suite.canonicalTests.map((test) => [test.id, test.externalCaseLink]),
  ) as Record<string, ExternalTestCaseLinkSummary | null>;
}

export function SuiteTestRailIntegrationClient({
  workspaceId,
  suite,
  canManage,
}: {
  workspaceId: string;
  suite: AutomationSuiteDetail;
  canManage: boolean;
}) {
  const [integration, setIntegration] = useState(suite.linkedSystems.testrail);
  const [formState, setFormState] = useState(() => toFormState(suite.linkedSystems.testrail));
  const [linkState, setLinkState] = useState<Record<string, ExternalTestCaseLinkSummary | null>>(
    () => toLinkMap(suite),
  );
  const [linkDrafts, setLinkDrafts] = useState<Record<string, { externalCaseId: string; ownerEmail: string }>>(
    () =>
      Object.fromEntries(
        suite.canonicalTests.map((test) => [test.id, toLinkDraft(test.externalCaseLink)]),
      ),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingTestId, setSavingTestId] = useState<string | null>(null);
  const [retryingTestId, setRetryingTestId] = useState<string | null>(null);

  async function saveIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const parsed = testrailIntegrationSchema.safeParse(formState);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'TestRail integration details are invalid.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await parseApiResponse<TestRailSuiteIntegration>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}/testrail-integration`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(parsed.data),
        }),
      );

      startTransition(() => {
        setIntegration(saved);
        setFormState(toFormState(saved));
      });
      setMessage(saved.validationMessage ?? 'TestRail integration saved.');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save TestRail integration.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function validateIntegration() {
    if (!canManage || !integration) {
      return;
    }

    setValidating(true);
    setError(null);
    setMessage(null);

    try {
      const refreshed = await parseApiResponse<TestRailSuiteIntegration>(
        await fetch(
          buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}/testrail-integration/validate`),
          {
            method: 'POST',
            credentials: 'include',
          },
        ),
      );

      startTransition(() => {
        setIntegration(refreshed);
      });
      setMessage(refreshed.validationMessage ?? 'TestRail integration validated.');
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'Unable to validate TestRail integration.',
      );
    } finally {
      setValidating(false);
    }
  }

  async function syncMappings() {
    if (!canManage || !integration) {
      return;
    }

    setSyncing(true);
    setError(null);
    setMessage(null);

    try {
      const result = await parseApiResponse<{
        integration: TestRailSuiteIntegration;
        syncRun: { summary: string | null } | null;
      }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}/testrail-integration/sync`), {
          method: 'POST',
          credentials: 'include',
        }),
      );

      startTransition(() => {
        setIntegration(result.integration);
      });
      setMessage(
        result.syncRun?.summary ??
          'TestRail sync completed. Refresh the page to review updated mapping snapshots.',
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : 'Unable to sync TestRail mappings.',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectIntegration() {
    if (!canManage || !integration) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setMessage(null);

    try {
      await parseApiResponse<{ removed: boolean }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}/testrail-integration`), {
          method: 'DELETE',
          credentials: 'include',
        }),
      );

      startTransition(() => {
        setIntegration(null);
        setFormState(emptyFormState());
      });
      setMessage('TestRail integration disconnected.');
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : 'Unable to disconnect TestRail integration.',
      );
    } finally {
      setDisconnecting(false);
    }
  }

  async function saveCaseLink(testId: string) {
    if (!canManage) {
      return;
    }

    const parsed = testrailCaseLinkSchema.safeParse(
      linkDrafts[testId] ?? { externalCaseId: '', ownerEmail: '' },
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'TestRail mapping is invalid.');
      return;
    }

    setSavingTestId(testId);
    setError(null);
    setMessage(null);

    try {
      const response = await parseApiResponse<
        ExternalTestCaseLinkSummary | { removed: boolean }
      >(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}/testrail-links/${testId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(parsed.data),
        }),
      );

      startTransition(() => {
        if ('removed' in response) {
          setLinkState((current) => ({ ...current, [testId]: null }));
          setLinkDrafts((current) => ({
            ...current,
            [testId]: { externalCaseId: '', ownerEmail: '' },
          }));
          return;
        }

        setLinkState((current) => ({ ...current, [testId]: response }));
        setLinkDrafts((current) => ({
          ...current,
          [testId]: {
            externalCaseId: response.externalCaseId,
            ownerEmail: response.ownerEmail ?? '',
          },
        }));
      });

      setMessage('removed' in response ? 'TestRail mapping removed.' : 'TestRail mapping saved.');
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Unable to save TestRail mapping.',
      );
    } finally {
      setSavingTestId(null);
    }
  }

  async function retryCaseLink(testId: string) {
    if (!canManage) {
      return;
    }

    setRetryingTestId(testId);
    setError(null);
    setMessage(null);

    try {
      const updated = await parseApiResponse<ExternalTestCaseLinkSummary>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suite.id}/testrail-links/${testId}/retry`), {
          method: 'POST',
          credentials: 'include',
        }),
      );

      startTransition(() => {
        setLinkState((current) => ({ ...current, [testId]: updated }));
        setLinkDrafts((current) => ({
          ...current,
          [testId]: {
            externalCaseId: updated.externalCaseId,
            ownerEmail: updated.ownerEmail ?? '',
          },
        }));
      });
      setMessage(updated.lastError ?? `Retried TestRail case ${updated.externalCaseId}.`);
    } catch (retryError) {
      setError(
        retryError instanceof Error ? retryError.message : 'Unable to retry TestRail mapping.',
      );
    } finally {
      setRetryingTestId(null);
    }
  }

  const statusLabel = integration
    ? `${integration.status} · project ${integration.projectId}`
    : 'Not connected';

  return (
    <div className="glass-panel rounded-none p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">TestRail</p>
          <h3 className="text-xl font-semibold">Metadata linkage and sync</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Link this suite to a TestRail project, map canonical tests to external cases,
            and run metadata-only syncs.
          </p>
        </div>
        <span className="status-pill">{statusLabel}</span>
      </div>

      <form className="grid gap-3 md:grid-cols-2" onSubmit={saveIntegration}>
        <input
          className="form-input"
          disabled={!canManage}
          placeholder="https://testrail.example.com"
          value={formState.baseUrl}
          onChange={(event) =>
            setFormState((current) => ({ ...current, baseUrl: event.target.value }))
          }
        />
        <input
          className="form-input"
          disabled={!canManage}
          placeholder="Project ID"
          value={formState.projectId}
          onChange={(event) =>
            setFormState((current) => ({ ...current, projectId: event.target.value }))
          }
        />
        <input
          className="form-input"
          disabled={!canManage}
          placeholder="Suite ID (optional)"
          value={formState.suiteIdExternal}
          onChange={(event) =>
            setFormState((current) => ({ ...current, suiteIdExternal: event.target.value }))
          }
        />
        <input
          className="form-input"
          disabled={!canManage}
          placeholder="Section ID (optional)"
          value={formState.sectionId}
          onChange={(event) =>
            setFormState((current) => ({ ...current, sectionId: event.target.value }))
          }
        />
        <input
          className="form-input"
          disabled={!canManage}
          placeholder="Username or email"
          value={formState.username}
          onChange={(event) =>
            setFormState((current) => ({ ...current, username: event.target.value }))
          }
        />
        <select className="form-input" disabled value={formState.syncPolicy} onChange={() => undefined}>
          <option value="MANUAL">Manual sync only</option>
        </select>
        <input
          className="form-input md:col-span-2"
          disabled={!canManage}
          placeholder="Secret reference"
          value={formState.secretRef}
          onChange={(event) =>
            setFormState((current) => ({ ...current, secretRef: event.target.value }))
          }
        />
        <input
          className="form-input md:col-span-2"
          disabled={!canManage}
          placeholder="API key"
          type="password"
          value={formState.apiKey}
          onChange={(event) =>
            setFormState((current) => ({ ...current, apiKey: event.target.value }))
          }
        />
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button className="primary-button" disabled={!canManage || saving} type="submit">
            {saving ? 'Saving...' : integration ? 'Update linkage' : 'Save linkage'}
          </button>
          <button
            className="secondary-button"
            disabled={!canManage || !integration || validating}
            type="button"
            onClick={() => void validateIntegration()}
          >
            {validating ? 'Validating...' : 'Revalidate'}
          </button>
          <button
            className="secondary-button"
            disabled={!canManage || !integration || syncing}
            type="button"
            onClick={() => void syncMappings()}
          >
            {syncing ? 'Syncing...' : 'Sync mapped cases'}
          </button>
          <button
            className="secondary-button"
            disabled={!canManage || !integration || disconnecting}
            type="button"
            onClick={() => void disconnectIntegration()}
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      </form>

      {integration ? (
        <div className="mt-5 space-y-3 text-sm text-[var(--muted)]">
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-medium text-[var(--text)]">Validation</p>
            <p className="mt-2">
              {integration.validationMessage ?? 'No validation summary recorded yet.'}
            </p>
            <p className="mt-2">
              Last validated:{' '}
              {formatDateTime(integration.lastValidatedAt)}
            </p>
            <p>
              Last synced:{' '}
              {formatDateTime(integration.lastSyncedAt)}
            </p>
            <p>
              Secret rotated:{' '}
              {integration.secretRotatedAt ? formatDateTime(integration.secretRotatedAt) : 'Not recorded'}
            </p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-medium text-[var(--text)]">Sync posture</p>
            <p className="mt-2">
              Project {integration.projectId}
              {integration.suiteIdExternal ? ` · Suite ${integration.suiteIdExternal}` : ''}
              {integration.sectionId ? ` · Section ${integration.sectionId}` : ''}
            </p>
            <p>
              Sync policy: {integration.syncPolicy} · Stored credential:{' '}
              {integration.hasStoredSecret ? 'Yes' : 'No'}
            </p>
            {integration.lastSyncRun ? (
              <p>
                Last run: {integration.lastSyncRun.status} · {integration.lastSyncRun.syncedCount}/
                {integration.lastSyncRun.totalCount} synced · {integration.lastSyncRun.failedCount} failed
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-5 border border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
          No TestRail project is linked to this suite yet.
        </div>
      )}

      <div className="mt-6 space-y-3">
        <div>
          <p className="eyebrow">Mapping review</p>
          <h4 className="text-lg font-semibold">Canonical test mappings</h4>
        </div>
        {suite.canonicalTests.map((test) => {
          const link = linkState[test.id] ?? null;
          const draft = linkDrafts[test.id] ?? toLinkDraft(link);

          return (
            <div key={test.id} className="border border-[var(--line)] bg-white p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2 text-sm text-[var(--muted)]">
                  <p className="font-medium text-[var(--text)]">{test.name}</p>
                  <p>Status: {test.status}</p>
                  <p>
                    Latest artifact:{' '}
                    {test.latestArtifact
                      ? `v${test.latestArtifact.version} · ${test.latestArtifact.status}`
                      : 'None'}
                  </p>
                  <p>
                    Mapped case: {link ? `${link.externalCaseId} · ${link.status}` : 'Not mapped'}
                  </p>
                  <p>
                    Last synced:{' '}
                    {formatDateTime(link?.lastSyncedAt ?? null)}
                  </p>
                  {link?.lastError ? (
                    <p className="text-[var(--danger)]">{link.lastError}</p>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:w-[32rem]">
                  <input
                    className="form-input"
                    disabled={!canManage}
                    placeholder="Case ID"
                    value={draft.externalCaseId}
                    onChange={(event) =>
                      setLinkDrafts((current) => ({
                        ...current,
                        [test.id]: { ...draft, externalCaseId: event.target.value },
                      }))
                    }
                  />
                  <input
                    className="form-input"
                    disabled={!canManage}
                    placeholder="Owner email"
                    value={draft.ownerEmail}
                    onChange={(event) =>
                      setLinkDrafts((current) => ({
                        ...current,
                        [test.id]: { ...draft, ownerEmail: event.target.value },
                      }))
                    }
                  />
                  <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                    <button
                      className="secondary-button"
                      disabled={!canManage || savingTestId === test.id}
                      type="button"
                      onClick={() => void saveCaseLink(test.id)}
                    >
                      {savingTestId === test.id ? 'Saving...' : 'Save mapping'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!canManage || !link?.retryEligible || retryingTestId === test.id}
                      type="button"
                      onClick={() => void retryCaseLink(test.id)}
                    >
                      {retryingTestId === test.id ? 'Retrying...' : 'Retry sync'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {message ? <p className="mt-4 text-sm text-[var(--success)]">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
