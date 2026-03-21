import { SettingsTabs } from '@/components/settings-tabs';
import { WorkspaceRunControlsClient } from '@/components/workspace-run-controls-client';
import { getServerSession, getWorkspaceDetails } from '@/lib/server-session';

function canManageWorkspace(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN' || role === 'WORKSPACE_OPERATOR';
}

export default async function ExecutionSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [session, workspace] = await Promise.all([getServerSession(), getWorkspaceDetails(workspaceId)]);
  const role = session?.memberships.find((membership) => membership.workspaceId === workspaceId)?.role;

  if (!workspace) {
    return null;
  }

  return (
    <div className="space-y-8">
      <SettingsTabs workspaceId={workspaceId} />
      <WorkspaceRunControlsClient workspaceId={workspaceId} initialWorkspace={workspace} canManage={canManageWorkspace(role)} />
    </div>
  );
}