import { redirect } from 'next/navigation';
import { QuotaSettingsClient } from '@/components/quota-settings-client';
import { SettingsTabs } from '@/components/settings-tabs';
import { getServerSession, getTenantQuotas } from '@/lib/server-session';

function canViewTenantQuotas(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN';
}

function canManageTenantQuotas(role: string | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN';
}

export default async function QuotaSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const canView = canViewTenantQuotas(membership.role);

  return (
    <div className="space-y-8">
      <SettingsTabs workspaceId={workspaceId} />

      {canView ? (
        <QuotaSettingsClient
          tenantId={membership.tenantId}
          initialOverview={(await getTenantQuotas(membership.tenantId))!}
          canManage={canManageTenantQuotas(membership.role)}
        />
      ) : (
        <div className="glass-panel rounded-none p-6">
          <p className="eyebrow">Restricted</p>
          <h2 className="section-title mt-2 text-2xl font-semibold">Tenant quota visibility requires admin access</h2>
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            This page is available to tenant admins and platform admins because quota limits apply across all workspaces in the tenant.
          </p>
        </div>
      )}
    </div>
  );
}