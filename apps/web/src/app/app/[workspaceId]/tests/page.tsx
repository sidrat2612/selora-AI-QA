import { redirect } from 'next/navigation';
import { RecordingCatalogClient } from '@/components/recording-catalog-client';
import type { RecordingStatus, TestStatus } from '@/lib/types';
import { getCanonicalTests, getRecordings, getServerSession } from '@/lib/server-session';

type SearchParams = Record<string, string | string[] | undefined>;

type RecordingQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: '' | RecordingStatus;
};

type TestQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: '' | TestStatus;
  tag: string;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRecordingStatus(value: string | undefined): '' | RecordingStatus {
  const statuses = new Set<RecordingStatus>(['UPLOADED', 'PROCESSING', 'NORMALIZED', 'FAILED', 'ARCHIVED']);
  return value && statuses.has(value as RecordingStatus) ? (value as RecordingStatus) : '';
}

function readTestStatus(value: string | undefined): '' | TestStatus {
  const statuses = new Set<TestStatus>([
    'INGESTED',
    'GENERATED',
    'VALIDATING',
    'VALIDATED',
    'AUTO_REPAIRED',
    'NEEDS_HUMAN_REVIEW',
    'ARCHIVED',
  ]);
  return value && statuses.has(value as TestStatus) ? (value as TestStatus) : '';
}

function parseRecordingQuery(searchParams: SearchParams): RecordingQuery {
  return {
    page: readPositiveInt(readParam(searchParams['rp']), 1),
    pageSize: readPositiveInt(readParam(searchParams['rps']), 20),
    search: readParam(searchParams['rs'])?.trim() ?? '',
    status: readRecordingStatus(readParam(searchParams['rstatus'])),
  };
}

function parseTestQuery(searchParams: SearchParams): TestQuery {
  return {
    page: readPositiveInt(readParam(searchParams['tp']), 1),
    pageSize: readPositiveInt(readParam(searchParams['tps']), 20),
    search: readParam(searchParams['ts'])?.trim() ?? '',
    status: readTestStatus(readParam(searchParams['tstatus'])),
    tag: readParam(searchParams['ttag'])?.trim() ?? '',
  };
}

export default async function TestsPage({
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

  const recordingQuery = parseRecordingQuery(resolvedSearchParams);
  const testQuery = parseTestQuery(resolvedSearchParams);

  const [recordings, tests] = await Promise.all([
    getRecordings(workspaceId, recordingQuery),
    getCanonicalTests(workspaceId, testQuery),
  ]);

  const canManage =
    membership.role === 'PLATFORM_ADMIN' ||
    membership.role === 'TENANT_ADMIN' ||
    membership.role === 'WORKSPACE_OPERATOR';

  return (
    <RecordingCatalogClient
      canManage={canManage}
      initialRecordingQuery={recordingQuery}
      initialRecordings={recordings}
      initialTestQuery={testQuery}
      initialTests={tests}
      workspaceId={workspaceId}
    />
  );
}