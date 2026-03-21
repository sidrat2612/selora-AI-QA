'use client';

import { startTransition, useMemo, useState } from 'react';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { BetaFeedback, FeedbackCategory, FeedbackPriority, FeedbackStatus } from '@/lib/types';

const CATEGORY_OPTIONS: FeedbackCategory[] = [
  'BUG',
  'UX',
  'PERFORMANCE',
  'INTEGRATION',
  'FEATURE_REQUEST',
  'OTHER',
];

const PRIORITY_OPTIONS: FeedbackPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUS_OPTIONS: FeedbackStatus[] = ['SUBMITTED', 'REVIEWED', 'PLANNED', 'DEFERRED', 'CLOSED'];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function FeedbackClient({
  workspaceId,
  initialFeedback,
  canManage,
}: {
  workspaceId: string;
  initialFeedback: BetaFeedback[];
  canManage: boolean;
}) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('BUG');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const prioritizedFeedback = useMemo(() => feedback, [feedback]);

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await parseApiResponse<BetaFeedback>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/feedback`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, summary, category }),
        }),
      );

      startTransition(() => {
        setFeedback((current) => [created, ...current]);
      });
      setTitle('');
      setSummary('');
      setCategory('BUG');
      setSuccessMessage('Feedback captured for beta triage.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateFeedback(feedbackId: string, next: { priority?: FeedbackPriority; status?: FeedbackStatus }) {
    if (!canManage) {
      return;
    }

    const previous = feedback;
    setError(null);
    setFeedback((current) =>
      current.map((item) => (item.id === feedbackId ? { ...item, ...next } : item)),
    );

    try {
      const updated = await parseApiResponse<BetaFeedback>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/feedback/${feedbackId}`), {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }),
      );

      setFeedback((current) => current.map((item) => (item.id === feedbackId ? updated : item)));
    } catch (updateError) {
      setFeedback(previous);
      setError(updateError instanceof Error ? updateError.message : 'Unable to update feedback.');
    }
  }

  return (
    <div className="space-y-8">
      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 space-y-2">
          <p className="eyebrow">Beta feedback</p>
          <h1 className="section-title text-3xl font-semibold">Capture partner feedback in-app</h1>
          <p className="max-w-3xl text-sm text-[var(--muted)]">
            Use this board to collect issues and requests from beta users, then prioritize them directly in the workspace so Sprint 9 and Sprint 10 planning reflects real field feedback.
          </p>
        </div>

        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_0.8fr_auto]" onSubmit={submitFeedback}>
          <input className="form-input" placeholder="Short title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className="form-input min-h-[48px]" placeholder="What happened, what is missing, and why it matters" value={summary} onChange={(event) => setSummary(event.target.value)} />
          <select className="form-select" value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button className="primary-button" disabled={submitting || title.trim().length < 3 || summary.trim().length < 3} type="submit">
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
        {successMessage ? <p className="mt-4 text-sm text-[var(--success)]">{successMessage}</p> : null}
      </section>

      <section className="space-y-4">
        {prioritizedFeedback.map((item) => (
          <article key={item.id} className="glass-panel rounded-none p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#999999]">
                  <span>{item.category}</span>
                  <span>•</span>
                  <span>{formatDate(item.createdAt)}</span>
                  <span>•</span>
                  <span>{item.submittedBy.name}</span>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text)]">{item.title}</h2>
                <p className="text-sm text-[var(--muted)]">{item.summary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="status-pill">{item.priority}</span>
                <span className="status-pill">{item.status}</span>
                {canManage ? (
                  <>
                    <select className="form-select min-w-36" value={item.priority} onChange={(event) => updateFeedback(item.id, { priority: event.target.value as FeedbackPriority })}>
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <select className="form-select min-w-40" value={item.status} onChange={(event) => updateFeedback(item.id, { status: event.target.value as FeedbackStatus })}>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {prioritizedFeedback.length === 0 ? (
          <div className="empty-state">No feedback submitted yet.</div>
        ) : null}
      </section>
    </div>
  );
}