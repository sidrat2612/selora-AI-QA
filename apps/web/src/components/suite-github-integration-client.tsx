'use client';

import { startTransition, useState } from 'react';
import { buildApiUrl, githubIntegrationSchema, parseApiResponse } from '@/lib/api';
import type { GitHubSuiteIntegration, GitHubCredentialMode, GitHubWriteScope } from '@/lib/types';

function emptyFormState() {
  return {
    credentialMode: 'PAT' as GitHubCredentialMode,
    repoOwner: '',
    repoName: '',
    defaultBranch: 'main',
    workflowPath: '.github/workflows/selora.yml',
    allowedWriteScope: 'READ_ONLY' as GitHubWriteScope,
    pullRequestRequired: true,
    secretRef: '',
    secretValue: '',
    appId: '',
    appSlug: '',
    installationId: '',
  };
}

function toFormState(integration: GitHubSuiteIntegration | null) {
  if (!integration) {
    return emptyFormState();
  }

  return {
    credentialMode: integration.credentialMode,
    repoOwner: integration.repoOwner,
    repoName: integration.repoName,
    defaultBranch: integration.defaultBranch,
    workflowPath: integration.workflowPath ?? '.github/workflows/selora.yml',
    allowedWriteScope: integration.allowedWriteScope,
    pullRequestRequired: integration.pullRequestRequired,
    secretRef: integration.secretRef ?? '',
    secretValue: '',
    appId: integration.appId ?? '',
    appSlug: integration.appSlug ?? '',
    installationId: integration.installationId ?? '',
  };
}

export function SuiteGitHubIntegrationClient({
  workspaceId,
  suiteId,
  initialIntegration,
  canManage,
}: {
  workspaceId: string;
  suiteId: string;
  initialIntegration: GitHubSuiteIntegration | null;
  canManage: boolean;
}) {
  const [integration, setIntegration] = useState(initialIntegration);
  const [formState, setFormState] = useState(() => toFormState(initialIntegration));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const result = githubIntegrationSchema.safeParse(formState);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'GitHub integration details are invalid.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await parseApiResponse<GitHubSuiteIntegration>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(result.data),
        }),
      );

      startTransition(() => {
        setIntegration(saved);
        setFormState((current) => ({ ...current, secretValue: '', defaultBranch: saved.defaultBranch }));
      });
      setMessage(saved.validationMessage ?? 'GitHub integration saved.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save GitHub integration.');
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    if (!canManage || !integration) {
      return;
    }

    setValidating(true);
    setError(null);
    setMessage(null);

    try {
      const refreshed = await parseApiResponse<GitHubSuiteIntegration>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration/validate`), {
          method: 'POST',
          credentials: 'include',
        }),
      );

      startTransition(() => {
        setIntegration(refreshed);
        setFormState((current) => ({ ...current, defaultBranch: refreshed.defaultBranch }));
      });
      setMessage(refreshed.validationMessage ?? 'GitHub integration validated.');
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Unable to validate GitHub integration.');
    } finally {
      setValidating(false);
    }
  }

  async function disconnect() {
    if (!canManage || !integration) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setMessage(null);

    try {
      await parseApiResponse<{ removed: boolean }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites/${suiteId}/github-integration`), {
          method: 'DELETE',
          credentials: 'include',
        }),
      );

      startTransition(() => {
        setIntegration(null);
        setFormState(emptyFormState());
      });
      setMessage('GitHub integration disconnected.');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Unable to disconnect GitHub integration.');
    } finally {
      setDisconnecting(false);
    }
  }

  const statusLabel = integration ? `${integration.status} · ${integration.repoOwner}/${integration.repoName}` : 'Not connected';

  return (
    <div className="glass-panel rounded-none p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">GitHub</p>
          <h3 className="text-xl font-semibold">Repository linkage</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Configure the one approved repository target for this suite. Publication stays disabled until Sprint 3.
          </p>
        </div>
        <span className="status-pill">{statusLabel}</span>
      </div>

      <form className="grid gap-3 md:grid-cols-2" onSubmit={save}>
        <label className="space-y-2 text-sm font-medium text-[var(--text)]">
          <span>Credential mode</span>
          <select
            className="form-input"
            disabled={!canManage}
            value={formState.credentialMode}
            onChange={(event) => setFormState((current) => ({ ...current, credentialMode: event.target.value as GitHubCredentialMode }))}
          >
            <option value="PAT">Personal access token</option>
            <option value="GITHUB_APP">GitHub App installation token</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-[var(--text)]">
          <span>Allowed write scope</span>
          <select
            className="form-input"
            disabled={!canManage}
            value={formState.allowedWriteScope}
            onChange={(event) => setFormState((current) => ({ ...current, allowedWriteScope: event.target.value as GitHubWriteScope }))}
          >
            <option value="READ_ONLY">Read only</option>
            <option value="BRANCH_PUSH">Branch push</option>
            <option value="PULL_REQUESTS">Pull requests</option>
          </select>
        </label>
        <input className="form-input" disabled={!canManage} placeholder="Repository owner" value={formState.repoOwner} onChange={(event) => setFormState((current) => ({ ...current, repoOwner: event.target.value }))} />
        <input className="form-input" disabled={!canManage} placeholder="Repository name" value={formState.repoName} onChange={(event) => setFormState((current) => ({ ...current, repoName: event.target.value }))} />
        <input className="form-input" disabled={!canManage} placeholder="Default branch" value={formState.defaultBranch} onChange={(event) => setFormState((current) => ({ ...current, defaultBranch: event.target.value }))} />
        <input className="form-input" disabled={!canManage} placeholder="Workflow path" value={formState.workflowPath} onChange={(event) => setFormState((current) => ({ ...current, workflowPath: event.target.value }))} />
        <input className="form-input md:col-span-2" disabled={!canManage} placeholder={formState.credentialMode === 'PAT' ? 'Secret reference' : 'Installation token secret reference'} value={formState.secretRef} onChange={(event) => setFormState((current) => ({ ...current, secretRef: event.target.value }))} />
        <input className="form-input md:col-span-2" disabled={!canManage} placeholder={formState.credentialMode === 'PAT' ? 'Secret value (optional for encrypted local storage)' : 'Installation token value (optional for encrypted local storage)'} type="password" value={formState.secretValue} onChange={(event) => setFormState((current) => ({ ...current, secretValue: event.target.value }))} />
        {formState.credentialMode === 'GITHUB_APP' ? (
          <>
            <input className="form-input" disabled={!canManage} placeholder="GitHub App ID" value={formState.appId} onChange={(event) => setFormState((current) => ({ ...current, appId: event.target.value }))} />
            <input className="form-input" disabled={!canManage} placeholder="GitHub App slug" value={formState.appSlug} onChange={(event) => setFormState((current) => ({ ...current, appSlug: event.target.value }))} />
            <input className="form-input md:col-span-2" disabled={!canManage} placeholder="Installation ID" value={formState.installationId} onChange={(event) => setFormState((current) => ({ ...current, installationId: event.target.value }))} />
          </>
        ) : null}
        <label className="flex items-center gap-3 text-sm text-[var(--muted)] md:col-span-2">
          <input checked={formState.pullRequestRequired} disabled={!canManage} type="checkbox" onChange={(event) => setFormState((current) => ({ ...current, pullRequestRequired: event.target.checked }))} />
          Require pull requests for future publication flows
        </label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button className="primary-button" disabled={!canManage || saving} type="submit">
            {saving ? 'Saving...' : integration ? 'Update linkage' : 'Save linkage'}
          </button>
          <button className="secondary-button" disabled={!canManage || !integration || validating} type="button" onClick={() => void validate()}>
            {validating ? 'Validating...' : 'Revalidate'}
          </button>
          <button className="secondary-button" disabled={!canManage || !integration || disconnecting} type="button" onClick={() => void disconnect()}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      </form>

      {integration ? (
        <div className="mt-5 space-y-3 text-sm text-[var(--muted)]">
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-medium text-[var(--text)]">Validation</p>
            <p className="mt-2">{integration.validationMessage ?? 'No validation summary recorded yet.'}</p>
            <p className="mt-2">Last validated: {integration.lastValidatedAt ? new Date(integration.lastValidatedAt).toLocaleString() : 'Never'}</p>
            <p>Secret rotated: {integration.secretRotatedAt ? new Date(integration.secretRotatedAt).toLocaleString() : 'Not recorded'}</p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-medium text-[var(--text)]">Repository policy</p>
            <p className="mt-2">{integration.repoOwner}/{integration.repoName} · {integration.defaultBranch}</p>
            <p>Write scope: {integration.allowedWriteScope} · PR required: {integration.pullRequestRequired ? 'Yes' : 'No'}</p>
            <p>Stored credential: {integration.hasStoredSecret ? 'Yes' : 'No'}{integration.secretRef ? ` · Ref ${integration.secretRef}` : ''}</p>
            {integration.permissions ? (
              <p>Permissions: pull {integration.permissions.pull ? 'yes' : 'no'} · push {integration.permissions.push ? 'yes' : 'no'} · admin {integration.permissions.admin ? 'yes' : 'no'}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-5 border border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
          No GitHub repository is linked to this suite yet.
        </div>
      )}

      {message ? <p className="mt-4 text-sm text-[var(--success)]">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}