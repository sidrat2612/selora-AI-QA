'use client';

import Link from 'next/link';
import { startTransition, useState } from 'react';
import { buildApiUrl, parseApiResponse, suiteSchema } from '@/lib/api';
import type { AutomationSuiteSummary } from '@/lib/types';

export function SuiteCatalogClient({
  workspaceId,
  initialSuites,
  canManage,
}: {
  workspaceId: string;
  initialSuites: AutomationSuiteSummary[];
  canManage: boolean;
}) {
  const [suites, setSuites] = useState(initialSuites);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function createSuite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const result = suiteSchema.safeParse({ name, slug, description });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Suite details are invalid.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await parseApiResponse<AutomationSuiteSummary>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/suites`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(result.data),
        }),
      );

      startTransition(() => {
        setSuites((current) => [created, ...current]);
      });
      setName('');
      setSlug('');
      setDescription('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create suite.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Suites</p>
            <h2 className="section-title text-2xl font-semibold">Automation suites</h2>
          </div>
          <span className="status-pill">{suites.length} configured</span>
        </div>

        {canManage ? (
          <form className="grid gap-3 lg:grid-cols-[1fr_0.8fr_1.2fr_auto]" onSubmit={createSuite}>
            <input className="form-input" placeholder="Suite name" value={name} onChange={(event) => setName(event.target.value)} />
            <input className="form-input" placeholder="Slug (optional)" value={slug} onChange={(event) => setSlug(event.target.value)} />
            <input className="form-input" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Creating...' : 'Create suite'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">View-only access — suite creation is disabled.</p>
        )}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {suites.length === 0 ? <div className="empty-state">No suites exist for this workspace yet.</div> : null}
        {suites.map((suite) => (
          <Link key={suite.id} href={`/app/${workspaceId}/suites/${suite.id}`} className="glass-panel rounded-none p-5 transition hover:border-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">/{suite.slug}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-black">{suite.name}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{suite.description || 'Suite ownership boundary for tests, publication, and future integrations.'}</p>
              </div>
              <span className="status-pill">{suite.isDefault ? 'DEFAULT' : suite.status}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="border border-[var(--line)] bg-white p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Canonical tests</p>
                <p className="mt-2 text-2xl font-semibold">{suite.counts.canonicalTests}</p>
              </div>
              <div className="border border-[var(--line)] bg-white p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Artifacts</p>
                <p className="mt-2 text-2xl font-semibold">{suite.counts.generatedArtifacts}</p>
              </div>
              <div className="border border-[var(--line)] bg-white p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Latest activity</p>
                <p className="mt-2 text-sm font-semibold">{new Date(suite.latestActivityAt).toLocaleString()}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}