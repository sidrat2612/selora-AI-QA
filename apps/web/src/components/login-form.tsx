'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { SessionData } from '@/lib/types';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@selora.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const session = await parseApiResponse<SessionData>(response);
      const workspaceId =
        session.activeWorkspace?.id ?? session.memberships.find((membership) => membership.workspaceId)?.workspaceId;

      startTransition(() => {
        router.push(workspaceId ? `/app/${workspaceId}/dashboard` : '/login');
        router.refresh();
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-[var(--muted)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Work email</span>
          <input
            autoComplete="username"
            className="form-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-[var(--muted)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Password</span>
          <input
            className="form-input"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
        <Link className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand)] underline-offset-4 hover:underline" href="/forgot-password">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}