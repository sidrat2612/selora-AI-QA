import { notFound, redirect } from 'next/navigation';
import { GeneratedTestDetailClient } from '@/components/generated-test-detail-client';
import {
  getCanonicalTestDetail,
  getGeneratedArtifactDetail,
  getRepairAttempts,
  getServerSession,
} from '@/lib/server-session';

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; testId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { workspaceId, testId } = await params;
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const test = await getCanonicalTestDetail(workspaceId, testId);
  if (!test) {
    notFound();
  }

  const selectedArtifactId = readParam(resolvedSearchParams['artifact']) ?? test.generatedArtifacts[0]?.id;
  const selectedArtifact = selectedArtifactId
    ? await getGeneratedArtifactDetail(workspaceId, testId, selectedArtifactId)
    : null;
  const repairAttempts = await getRepairAttempts(workspaceId, testId);

  const canManage =
    membership.role === 'PLATFORM_ADMIN' ||
    membership.role === 'TENANT_ADMIN' ||
    membership.role === 'WORKSPACE_OPERATOR';

  return (
    <GeneratedTestDetailClient
      canManage={canManage}
      repairAttempts={repairAttempts}
      selectedArtifact={selectedArtifact}
      test={test}
      workspaceId={workspaceId}
    />
  );
}