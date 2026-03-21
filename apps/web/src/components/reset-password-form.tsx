'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError('Reset token is missing.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await parseApiResponse<{ reset: boolean }>(
        await fetch(buildApiUrl('/auth/reset-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token, newPassword: password }),
        }),
      );

      setMessage('Password updated. You can sign in now.');
      setPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <label className="space-y-2 text-sm font-medium text-[var(--muted)]">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">New password</span>
        <input
          autoComplete="new-password"
          className="form-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 10 characters"
        />
      </label>

      {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Updating...' : 'Update password'}
        </button>
        <Link className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand)] underline-offset-4 hover:underline" href="/login">
          Back to login
        </Link>
      </div>
    </form>
  );
}