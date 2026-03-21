import { SettingsTabs } from '@/components/settings-tabs';
import { RetentionSettingsClient } from '@/components/retention-settings-client';
import { getRetention, getServerSession } from '@/lib/server-session';

function canManageWorkspace(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN' || role === 'WORKSPACE_OPERATOR';
}

export default async function RetentionSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [session, retention] = await Promise.all([getServerSession(), getRetention(workspaceId)]);
  const role = session?.memberships.find((membership) => membership.workspaceId === workspaceId)?.role;

  if (!retention) {
    return null;
  }

  return (
    <div className="space-y-8">
      <SettingsTabs workspaceId={workspaceId} />
      <RetentionSettingsClient workspaceId={workspaceId} initialRetention={retention} canManage={canManageWorkspace(role)} />
    </div>
  );
}