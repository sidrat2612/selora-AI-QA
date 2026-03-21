'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { buildApiUrl, parseApiResponse } from '@/lib/api';
import type { AuditEventSummary, PaginatedResult } from '@/lib/types';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AuditTrailClient({
  workspaceId,
  initialEvents,
  eventTypes,
  initialFilters,
}: {
  workspaceId: string;
  initialEvents: PaginatedResult<AuditEventSummary>;
  eventTypes: string[];
  initialFilters: {
    eventType: string;
    page: number;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [events, setEvents] = useState(initialEvents);
  const [eventTypeFilter, setEventTypeFilter] = useState(initialFilters.eventType);
  const [currentPage, setCurrentPage] = useState(initialFilters.page);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchEvents(page: number, eventType: string) {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (eventType) {
        params.set('eventType', eventType);
      }

      const result = await parseApiResponse<PaginatedResult<AuditEventSummary>>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/audit-events?${params.toString()}`), {
          credentials: 'include',
          cache: 'no-store',
        }),
      );

      setEvents(result);
      setCurrentPage(page);

      const search = new URLSearchParams();
      if (eventType) {
        search.set('eventType', eventType);
      }

      if (page > 1) {
        search.set('page', String(page));
      }

      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    } catch {
      // stay on current data
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(nextEventType: string) {
    setEventTypeFilter(nextEventType);
    void fetchEvents(1, nextEventType);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="eyebrow">Sprint 6</p>
          <h1 className="section-title text-4xl font-semibold">Audit trail</h1>
          <p className="max-w-3xl text-[var(--muted)]">
            Browse workspace audit events with filtering by event type. Expand any row to inspect full metadata.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="status-pill">{events.totalCount} total events</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Event type</span>
          <select
            className="form-input min-w-[14rem]"
            value={eventTypeFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
          >
            <option value="">All event types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="glass-panel rounded-none p-6">
        <div className="space-y-3">
          {events.items.length === 0 ? (
            <div className="empty-state min-h-[9rem]">
              {loading ? 'Loading...' : 'No audit events found for the current filters.'}
            </div>
          ) : (
            events.items.map((event) => {
              const isExpanded = expandedId === event.id;

              return (
                <button
                  key={event.id}
                  className={`w-full border px-4 py-4 text-left transition ${
                    isExpanded
                      ? 'border-[var(--brand)] bg-white'
                      : 'border-[var(--line)] bg-white hover:bg-[var(--bg)]'
                  }`}
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--brand)]">
                          {event.eventType}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">
                          {event.entityType} · {event.entityId.slice(0, 8)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted)]">
                        {event.actor ? `${event.actor.name} (${event.actor.email})` : 'System'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>{formatDate(event.createdAt)}</p>
                      {event.requestId ? (
                        <p className="mt-1 font-mono">{event.requestId.slice(0, 12)}</p>
                      ) : null}
                    </div>
                  </div>

                  {isExpanded && event.metadataJson ? (
                    <div className="mt-4">
                      <pre className="overflow-auto rounded-none border border-[var(--line)] bg-[rgba(16,24,40,0.92)] p-4 text-xs text-white">
                        {JSON.stringify(event.metadataJson, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {events.totalCount > events.pageSize ? (
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--muted)]">
              Page {currentPage} of {Math.ceil(events.totalCount / events.pageSize)} ·{' '}
              {events.totalCount} total events
            </p>
            <div className="flex gap-2">
              <button
                className="secondary-button"
                disabled={currentPage <= 1 || loading}
                type="button"
                onClick={() => void fetchEvents(currentPage - 1, eventTypeFilter)}
              >
                Previous
              </button>
              <button
                className="secondary-button"
                disabled={!events.hasMore || loading}
                type="button"
                onClick={() => void fetchEvents(currentPage + 1, eventTypeFilter)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
