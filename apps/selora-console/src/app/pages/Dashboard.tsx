import { 
  Building2, 
  Users, 
  Database, 
  AlertTriangle, 
  Activity,
  BarChart3,
} from "lucide-react";
import { KPICard } from "../components/KPICard";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Link } from "react-router";
import { Alert, AlertDescription } from "../components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth-context";
import { license as licenseApi, tenants as tenantsApi, workspaces as workspacesApi, audit as auditApi, platform as platformApi, type Tenant, type Workspace } from "../../lib/api-client";
import { ErrorState } from "../components/ErrorState";
import { useMemo } from "react";

export function Dashboard() {
  const { memberships } = useAuth();

  // Get unique tenant IDs from user's memberships
  const tenantIds = useMemo(() => {
    const ids = new Set(memberships.map((m) => m.tenantId));
    return Array.from(ids);
  }, [memberships]);

  // Fetch each tenant's details
  const { data: tenantList = [] } = useQuery({
    queryKey: ["tenants", tenantIds],
    queryFn: () => Promise.all(tenantIds.map((id) => tenantsApi.get(id))),
    enabled: tenantIds.length > 0,
  });

  // Fetch workspaces per tenant
  const { data: workspacesByTenant = {} } = useQuery({
    queryKey: ["tenants-workspaces", tenantIds],
    queryFn: async () => {
      const entries = await Promise.all(
        tenantIds.map(async (id) => {
          const ws = await workspacesApi.listForTenant(id);
          return [id, ws] as [string, Workspace[]];
        }),
      );
      return Object.fromEntries(entries) as Record<string, Workspace[]>;
    },
    enabled: tenantIds.length > 0,
  });

  const { data: licenseStatus } = useQuery({
    queryKey: ["license-status"],
    queryFn: () => licenseApi.getStatus(),
  });

  const { data: platformStats } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => platformApi.getStats(),
  });

  const totalWorkspaces = Object.values(workspacesByTenant).reduce((sum, ws) => sum + ws.length, 0);
  const activeTenants = tenantList.filter((t) => t.status === "active" || t.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform Overview</h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor tenants, usage, and platform health across the Selora platform
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Tenants"
          value={String(tenantList.length)}
          icon={Building2}
        />
        <KPICard
          title="Active Tenants"
          value={String(activeTenants)}
          icon={Activity}
        />
        <KPICard
          title="Total Workspaces"
          value={String(totalWorkspaces)}
          icon={Database}
        />
        <KPICard
          title="Platform Users"
          value={String(platformStats?.userCount ?? 0)}
          icon={Users}
        />
      </div>

      {/* Tenant Overview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tenants */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Tenants</h3>
            <Link to="/tenants">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          <div className="mt-6 space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {tenantList.length === 0 && (
              <p className="text-sm text-slate-500">No tenants yet</p>
            )}
            {tenantList.slice(0, 5).map((tenant) => (
              <Link
                key={tenant.id}
                to={`/tenants/${tenant.id}`}
                className="block rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <p className="font-medium text-slate-900">{tenant.name}</p>
                      <StatusBadge status={tenant.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                      <span>{(workspacesByTenant[tenant.id] ?? []).length} workspaces</span>
                      <span>Created {new Date(tenant.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Quick Links */}
        <Card className="p-6">
          <h3 className="text-base font-semibold text-slate-900">Platform Administration</h3>
          <div className="mt-6 space-y-3">
            <Link
              to="/tenants"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <Building2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium text-slate-900">Manage Tenants</p>
                <p className="text-xs text-slate-500">Create, manage, and oversee tenant organizations</p>
              </div>
            </Link>
            <Link
              to="/audit"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium text-slate-900">Audit Trail</p>
                <p className="text-xs text-slate-500">Review platform-wide audit events</p>
              </div>
            </Link>
            <Link
              to="/usage"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <Activity className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium text-slate-900">Usage & Quotas</p>
                <p className="text-xs text-slate-500">Monitor resource consumption and limits</p>
              </div>
            </Link>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">License Status</h3>
            <p className="mt-1 text-sm text-slate-600">
              Current enforcement mode for premium platform capabilities
            </p>
          </div>
          <StatusBadge status={licenseStatus?.commercialUseAllowed ? "ACTIVE" : "PENDING"} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-600">Tier</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 capitalize">
              {licenseStatus?.tier ?? "evaluation"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-600">Licensed To</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {licenseStatus?.licensedTo ?? "Not configured"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-600">Premium Features</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {licenseStatus?.commercialUseAllowed ? "Unlocked" : "Blocked"}
            </p>
          </div>
        </div>
        {!licenseStatus?.commercialUseAllowed && (
          <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-900">
            <AlertDescription className="text-amber-800">
              Premium features are protected while this instance remains on an evaluation license. Configure a commercial license key to unlock GitHub integration, TestRail integration, and artifact publication.
            </AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  );
}