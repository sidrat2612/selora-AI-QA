import { getAuditEvents, getAuditEventTypes } from '@/lib/server-session';
import { AuditTrailClient } from '@/components/audit-trail-client';

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const query = await searchParams;

  const eventType = typeof query['eventType'] === 'string' ? query['eventType'] : '';
  const page = typeof query['page'] === 'string' ? Math.max(1, Number(query['page']) || 1) : 1;

  const apiQuery: Record<string, string> = { page: String(page), pageSize: '20' };
  if (eventType) apiQuery['eventType'] = eventType;

  const [events, eventTypes] = await Promise.all([
    getAuditEvents(workspaceId, apiQuery),
    getAuditEventTypes(workspaceId),
  ]);

  return (
    <AuditTrailClient
      workspaceId={workspaceId}
      initialEvents={events}
      eventTypes={eventTypes}
      initialFilters={{ eventType, page }}
    />
  );
}