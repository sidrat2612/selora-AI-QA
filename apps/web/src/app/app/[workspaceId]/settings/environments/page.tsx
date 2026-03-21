import { SettingsTabs } from '@/components/settings-tabs';
import { EnvironmentsSettingsClient } from '@/components/environments-settings-client';
import { getEnvironments, getServerSession } from '@/lib/server-session';

function canManageWorkspace(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN' || role === 'WORKSPACE_OPERATOR';
}

export default async function EnvironmentsSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [session, environments] = await Promise.all([getServerSession(), getEnvironments(workspaceId)]);
  const role = session?.memberships.find((membership) => membership.workspaceId === workspaceId)?.role;

  return (
    <div className="space-y-8">
      <SettingsTabs workspaceId={workspaceId} />
      <EnvironmentsSettingsClient workspaceId={workspaceId} initialEnvironments={environments} canManage={canManageWorkspace(role)} />
    </div>
  );
}