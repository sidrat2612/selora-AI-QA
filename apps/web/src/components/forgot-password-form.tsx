'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('admin@selora.local');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await parseApiResponse<{ submitted: boolean }>(
        await fetch(buildApiUrl('/auth/forgot-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email }),
        }),
      );

      setMessage('If the address exists, a reset email has been sent.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <label className="space-y-2 text-sm font-medium text-[var(--muted)]">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Account email</span>
        <input
          autoComplete="email"
          className="form-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Sending...' : 'Send reset link'}
        </button>
        <Link className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand)] underline-offset-4 hover:underline" href="/login">
          Back to login
        </Link>
      </div>
    </form>
  );
}