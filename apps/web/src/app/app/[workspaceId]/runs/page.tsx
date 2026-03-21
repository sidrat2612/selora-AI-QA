import { redirect } from 'next/navigation';
import { RunsClient } from '@/components/runs-client';
import {
  getCanonicalTests,
  getEnvironments,
  getRunDetail,
  getRunItems,
  getRuns,
  getServerSession,
} from '@/lib/server-session';
import type { CanonicalTestSummary } from '@/lib/types';

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dedupeTests(items: CanonicalTestSummary[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export default async function RunsPage({
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

  const [environments, validatedTests, autoRepairedTests, runs] = await Promise.all([
    getEnvironments(workspaceId),
    getCanonicalTests(workspaceId, { page: 1, pageSize: 100, status: 'VALIDATED' }),
    getCanonicalTests(workspaceId, { page: 1, pageSize: 100, status: 'AUTO_REPAIRED' }),
    getRuns(workspaceId, { page: 1, pageSize: 20 }),
  ]);

  const eligibleTests = dedupeTests([...validatedTests.items, ...autoRepairedTests.items]);
  const requestedRunId = readParam(resolvedSearchParams['run']);
  const selectedRunId = requestedRunId && runs.items.some((item) => item.id === requestedRunId)
    ? requestedRunId
    : runs.items[0]?.id;

  const [selectedRun, selectedRunItems] = selectedRunId
    ? await Promise.all([getRunDetail(workspaceId, selectedRunId), getRunItems(workspaceId, selectedRunId)])
    : [null, []];

  const canManage =
    membership.role === 'PLATFORM_ADMIN' ||
    membership.role === 'TENANT_ADMIN' ||
    membership.role === 'WORKSPACE_OPERATOR';

  return (
    <RunsClient
      canManage={canManage}
      eligibleTests={eligibleTests}
      environments={environments}
      initialRuns={runs}
      initialSelectedRun={selectedRun}
      initialSelectedRunItems={selectedRunItems}
      workspaceId={workspaceId}
    />
  );
}