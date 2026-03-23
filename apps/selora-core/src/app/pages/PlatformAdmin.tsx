import { Link } from "react-router";
import { Plus, Search, Building2, Users, Database } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { StatusBadge } from "../components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { tenants as tenantsApi, workspaces as workspacesApi, type Tenant, type Workspace } from "../../lib/api-client";
import { useAuth, usePermissions } from "../../lib/auth-context";
import { Navigate } from "react-router";

export function PlatformAdmin() {
  const [searchQuery, setSearchQuery] = useState("");
  const { memberships } = useAuth();
  const permissions = usePermissions();

  if (!permissions.isSeloraAdmin) {
    return <Navigate to="/" replace />;
  }

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

  // Fetch workspaces per tenant for counts
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

  const filteredTenants = tenantList.filter((tenant: Tenant) =>
    tenant.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalWorkspaces = Object.values(workspacesByTenant).reduce((sum, ws) => sum + ws.length, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform Administration</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage tenants, workspaces, and platform-level governance
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Tenant
        </Button>
      </div>

      {/* Platform Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Tenants</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{tenantList.length}</p>
            </div>
            <Building2 className="h-8 w-8 text-slate-200" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Workspaces</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{totalWorkspaces}</p>
            </div>
            <Database className="h-8 w-8 text-slate-200" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Tenant Users</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">—</p>
            </div>
            <Users className="h-8 w-8 text-slate-200" />
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search tenants..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tenants Table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Workspaces</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTenants.map((tenant: Tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <Link
                      to={`/platform-admin/tenants/${tenant.id}`}
                      className="font-medium text-slate-900 hover:text-emerald-600"
                    >
                      {tenant.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={tenant.status} />
                </TableCell>
                <TableCell className="text-slate-900">
                  {(workspacesByTenant[tenant.id] ?? []).length} workspaces
                </TableCell>
                <TableCell className="text-slate-600">
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Link to={`/platform-admin/tenants/${tenant.id}`}>
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
