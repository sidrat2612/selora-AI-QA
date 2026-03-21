import { redirect } from 'next/navigation';
import { SuiteCatalogClient } from '@/components/suite-catalog-client';
import { getServerSession, getSuites } from '@/lib/server-session';

export default async function SuitesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const suites = await getSuites(workspaceId);
  const canManage =
    membership.role === 'PLATFORM_ADMIN' ||
    membership.role === 'TENANT_ADMIN' ||
    membership.role === 'WORKSPACE_OPERATOR';

  return <SuiteCatalogClient workspaceId={workspaceId} initialSuites={suites} canManage={canManage} />;
}