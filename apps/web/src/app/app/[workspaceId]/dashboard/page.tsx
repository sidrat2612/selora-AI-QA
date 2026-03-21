import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRepairAnalytics, getServerSession, getWorkspaceDetails } from '@/lib/server-session';
import type { RepairMode, RepairStatus } from '@/lib/types';

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRepairMode(value: string | undefined): RepairMode | '' {
  return value === 'RULE_BASED' || value === 'LLM_ASSISTED' ? value : '';
}

function readRepairStatus(value: string | undefined): RepairStatus | '' {
  return value === 'SUGGESTED' ||
    value === 'APPLIED' ||
    value === 'RERUN_PASSED' ||
    value === 'RERUN_FAILED' ||
    value === 'ABANDONED' ||
    value === 'HUMAN_REVIEW_REQUIRED'
    ? value
    : '';
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not finished';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function toDateInput(value: string) {
  return value.slice(0, 10);
}

function buildDashboardPath(
  workspaceId: string,
  query: Record<string, string | number | undefined>,
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized ? `/app/${workspaceId}/dashboard?${serialized}` : `/app/${workspaceId}/dashboard`;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { workspaceId } = await params;
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const page = readPositiveInt(readParam(resolvedSearchParams['page']), 1);
  const mode = readRepairMode(readParam(resolvedSearchParams['mode']));
  const status = readRepairStatus(readParam(resolvedSearchParams['status']));
  const since = readParam(resolvedSearchParams['since'])?.trim() ?? '';
  const until = readParam(resolvedSearchParams['until'])?.trim() ?? '';

  const [workspace, analytics] = await Promise.all([
    getWorkspaceDetails(workspaceId),
    getRepairAnalytics(workspaceId, {
      page,
      pageSize: 10,
      mode: mode || undefined,
      status: status || undefined,
      since: since || undefined,
      until: until || undefined,
    }),
  ]);

  if (!workspace || !analytics) {
    redirect('/login');
  }

  const maxTrendCount = Math.max(...analytics.trends.map((point) => point.totalAttempts), 1);
  const previousPageHref = buildDashboardPath(workspaceId, {
    page: Math.max(1, page - 1),
    mode: mode || undefined,
    status: status || undefined,
    since: since || undefined,
    until: until || undefined,
  });
  const nextPageHref = buildDashboardPath(workspaceId, {
    page: page + 1,
    mode: mode || undefined,
    status: status || undefined,
    since: since || undefined,
    until: until || undefined,
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">Sprint 8</p>
            <h1 className="section-title text-4xl font-semibold">Repair analytics</h1>
            <p className="max-w-3xl text-[var(--muted)]">
              Track repair quality across {workspace.name}. This dashboard rolls up repair outcomes, mode usage, trend movement, and recent attempts so beta feedback can focus on weak spots instead of individual failures.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="status-pill">{membership.role}</span>
            <span className="status-pill">{formatDate(analytics.periodStart)} to {formatDate(analytics.periodEnd)}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Repair attempts', String(analytics.totals.totalAttempts)],
          ['Success rate', formatPercent(analytics.totals.successRate)],
          ['Successful reruns', String(analytics.totals.successfulAttempts)],
          ['Modes used', String(analytics.totals.modesUsed)],
        ].map(([label, value]) => (
          <div key={label} className="border border-[var(--line)] bg-white p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{label}</p>
            <p className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[var(--text)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
        <div className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Filters</p>
            <h2 className="section-title text-2xl font-semibold">Slice the repair history</h2>
          </div>

          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" method="get">
            <label className="space-y-2 text-sm text-[var(--muted)]">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Mode</span>
              <select
                className="form-input"
                defaultValue={mode}
                name="mode"
              >
                <option value="">All modes</option>
                <option value="RULE_BASED">Rule based</option>
                <option value="LLM_ASSISTED">LLM assisted</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-[var(--muted)]">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Status</span>
              <select
                className="form-input"
                defaultValue={status}
                name="status"
              >
                <option value="">All statuses</option>
                <option value="RERUN_PASSED">Rerun passed</option>
                <option value="RERUN_FAILED">Rerun failed</option>
                <option value="HUMAN_REVIEW_REQUIRED">Human review required</option>
                <option value="ABANDONED">Abandoned</option>
                <option value="APPLIED">Applied</option>
                <option value="SUGGESTED">Suggested</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-[var(--muted)]">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Since</span>
              <input
                className="form-input"
                defaultValue={since || toDateInput(analytics.periodStart)}
                name="since"
                type="date"
              />
            </label>

            <label className="space-y-2 text-sm text-[var(--muted)]">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Until</span>
              <input
                className="form-input"
                defaultValue={until || toDateInput(analytics.periodEnd)}
                name="until"
                type="date"
              />
            </label>

            <div className="flex items-end gap-3">
              <button className="primary-button w-full justify-center" type="submit">
                Apply
              </button>
              <Link className="secondary-button justify-center" href={`/app/${workspaceId}/dashboard`}>
                Reset
              </Link>
            </div>
          </form>
        </div>

        <div className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Breakdown</p>
            <h2 className="section-title text-2xl font-semibold">Status mix</h2>
          </div>

          <div className="flex flex-wrap gap-3">
            {analytics.byStatus.length > 0 ? (
              analytics.byStatus.map((item) => (
                <div key={item.status} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {item.status} · {item.totalAttempts}
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">No repair attempts matched the current filters.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <div className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Trend</p>
            <h2 className="section-title text-2xl font-semibold">Repair outcomes over time</h2>
          </div>

          <div className="space-y-3">
            {analytics.trends.map((point) => (
              <div key={point.bucketStart} className="grid gap-3 border border-[var(--line)] bg-[var(--bg)] px-4 py-3 md:grid-cols-[140px_minmax(0,1fr)_120px] md:items-center">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">{new Date(point.bucketStart).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{point.interval}</p>
                </div>

                <div className="space-y-2">
                  <div className="h-2 overflow-hidden bg-[rgba(15,23,42,0.08)]">
                    <div
                      className="h-full bg-[linear-gradient(90deg,#111111,#dc2626)]"
                      style={{ width: `${Math.max((point.totalAttempts / maxTrendCount) * 100, point.totalAttempts > 0 ? 10 : 0)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--muted)]">
                    <span>Total {point.totalAttempts}</span>
                    <span>Passed {point.successfulAttempts}</span>
                    <span>Failed {point.failedAttempts}</span>
                  </div>
                </div>

                <div className="text-sm font-medium text-[var(--text)] md:text-right">{formatPercent(point.successRate)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-none p-6">
          <div className="mb-5 space-y-2">
            <p className="eyebrow">Modes</p>
            <h2 className="section-title text-2xl font-semibold">How each repair mode performs</h2>
          </div>

          <div className="space-y-4">
            {analytics.byMode.length > 0 ? (
              analytics.byMode.map((modeRow) => (
                <div key={modeRow.repairMode} className="border border-[var(--line)] bg-[var(--bg)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">{modeRow.repairMode}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[var(--text)]">{formatPercent(modeRow.successRate)}</p>
                    </div>
                    <div className="text-right text-sm text-[var(--muted)]">
                      <p>{modeRow.totalAttempts} attempts</p>
                      <p>{modeRow.successfulAttempts} successful</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">No mode data yet for the current filter set.</p>
            )}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-none p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Recent attempts</p>
            <h2 className="section-title text-2xl font-semibold">Filterable repair attempt list</h2>
          </div>
          <div className="text-sm text-[var(--muted)]">
            Page {analytics.attempts.page} · {analytics.attempts.totalCount} total matching attempts
          </div>
        </div>

        {analytics.attempts.items.length > 0 ? (
          <div className="space-y-4">
            {analytics.attempts.items.map((attempt) => (
              <article
                key={attempt.id}
                className="rounded-none border border-[var(--line)] bg-[var(--bg)] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold tracking-[-0.04em] text-[var(--text)]">{attempt.canonicalTest.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      Attempt {attempt.attemptNumber} · Artifact v{attempt.generatedTestArtifact.version} · {attempt.generatedTestArtifact.fileName}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{attempt.diffSummary ?? 'No diff summary recorded.'}</p>
                  </div>

                  <div className="space-y-2 text-sm text-[var(--muted)] lg:text-right">
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <span className="status-pill">{attempt.repairMode}</span>
                      <span className="status-pill">{attempt.status}</span>
                      <span className="status-pill">{attempt.canonicalTest.status}</span>
                    </div>
                    <p>Started {formatDate(attempt.startedAt)}</p>
                    <p>Finished {formatDate(attempt.finishedAt)}</p>
                    {attempt.modelName ? <p>Model {attempt.modelName}</p> : null}
                  </div>
                </div>
              </article>
            ))}

            <div className="flex items-center justify-between pt-2">
              {page > 1 ? (
                <Link className="secondary-button" href={previousPageHref}>
                  Previous page
                </Link>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Beginning of results</span>
              )}

              {analytics.attempts.hasMore ? (
                <Link className="secondary-button" href={nextPageHref}>
                  Next page
                </Link>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">No more pages</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">No repair attempts matched the current filters.</p>
        )}
      </section>
    </div>
  );
}