import { notFound, redirect } from 'next/navigation';
import { SuiteDetailClient } from '@/components/suite-detail-client';
import { getServerSession, getSuiteDetail } from '@/lib/server-session';

export default async function SuiteDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; suiteId: string }>;
}) {
  const { workspaceId, suiteId } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const suite = await getSuiteDetail(workspaceId, suiteId);
  if (!suite) {
    notFound();
  }

  const canManage =
    membership.role === 'PLATFORM_ADMIN' ||
    membership.role === 'TENANT_ADMIN' ||
    membership.role === 'WORKSPACE_OPERATOR';

  return <SuiteDetailClient workspaceId={workspaceId} suite={suite} canManage={canManage} />;
}