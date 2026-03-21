import { SettingsTabs } from '@/components/settings-tabs';
import { MembersSettingsClient } from '@/components/members-settings-client';
import { getMemberships, getServerSession } from '@/lib/server-session';

function canManageWorkspace(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN' || role === 'WORKSPACE_OPERATOR';
}

export default async function MembersSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [session, memberships] = await Promise.all([getServerSession(), getMemberships(workspaceId)]);
  const role = session?.memberships.find((membership) => membership.workspaceId === workspaceId)?.role;

  return (
    <div className="space-y-8">
      <SettingsTabs workspaceId={workspaceId} />
      <MembersSettingsClient workspaceId={workspaceId} initialMemberships={memberships} canManage={canManageWorkspace(role)} />
    </div>
  );
}