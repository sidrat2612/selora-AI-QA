import { redirect } from 'next/navigation';
import { SettingsTabs } from '@/components/settings-tabs';
import { TenantLifecycleClient } from '@/components/tenant-lifecycle-client';
import { getServerSession, getTenantLifecycle } from '@/lib/server-session';

function canManageTenant(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN';
}

export default async function LifecycleSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const canManage = canManageTenant(membership.role);
  const tenant = canManage ? await getTenantLifecycle(membership.tenantId) : null;

  return (
    <div className="space-y-8">
      <SettingsTabs workspaceId={workspaceId} />

      {tenant ? (
        <TenantLifecycleClient
          workspaceId={workspaceId}
          tenantId={membership.tenantId}
          initialTenant={tenant}
          canManage={canManage}
        />
      ) : (
        <div className="glass-panel rounded-none p-6">
          <p className="eyebrow">Restricted</p>
          <h2 className="section-title mt-2 text-2xl font-semibold">Tenant lifecycle requires admin access</h2>
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            Suspension, archival, soft-delete recovery windows, and tenant exports are limited to tenant admins and platform admins.
          </p>
        </div>
      )}
    </div>
  );
}