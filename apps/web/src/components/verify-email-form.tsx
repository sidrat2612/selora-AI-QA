'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';

export function VerifyEmailForm({ token }: { token: string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError('Verification token is missing.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await parseApiResponse<{ verified: boolean }>(
        await fetch(buildApiUrl('/auth/verify-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        }),
      );

      setMessage('Email verified. You can sign in now.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <p className="text-sm text-[var(--muted)]">
        Confirm the invite to activate your workspace access and open the Sprint 1 shell.
      </p>

      {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Verifying...' : 'Verify email'}
        </button>
        <Link className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand)] underline-offset-4 hover:underline" href="/login">
          Back to login
        </Link>
      </div>
    </form>
  );
}