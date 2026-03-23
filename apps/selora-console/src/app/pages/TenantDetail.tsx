import { useParams, Link } from "react-router";
import { ArrowLeft, Building2, Users, Database, Settings, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { StatusBadge } from "../components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { tenants as tenantsApi, workspaces as workspacesApi, quotas as quotasApi } from "../../lib/api-client";

export function TenantDetail() {
  const { id } = useParams();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => tenantsApi.get(id!),
    enabled: !!id,
  });

  const { data: tenantWorkspaces = [] } = useQuery({
    queryKey: ["tenant-workspaces", id],
    queryFn: () => workspacesApi.listForTenant(id!),
    enabled: !!id,
  });

  const { data: quotaData } = useQuery({
    queryKey: ["tenant-quotas", id],
    queryFn: () => quotasApi.get(id!),
    enabled: !!id,
  });

  const quotaEntries = Object.entries(quotaData ?? {})
    .filter(([, v]) => v && typeof v === "object" && "used" in (v as Record<string, unknown>) && "limit" in (v as Record<string, unknown>))
    .map(([key, v]) => {
      const val = v as { used: number; limit: number; unit?: string };
      return { name: key, used: val.used, limit: val.limit, unit: val.unit ?? "" };
    });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-slate-600">Loading...</div>;
  }

  if (!tenant) {
    return <div className="flex items-center justify-center py-12 text-slate-600">Tenant not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link to="/tenants">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tenants
        </Button>
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{tenant.name}</h1>
              <p className="text-sm text-slate-600">Created: {new Date(tenant.createdAt).toLocaleDateString()}</p>
            </div>
            <StatusBadge status={tenant.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Configure
          </Button>
          <Button variant="outline" className="text-red-600">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Suspend
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Database className="h-4 w-4" />
            <span>Workspaces</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{tenantWorkspaces.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Users className="h-4 w-4" />
            <span>Plan</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{tenant.plan ?? "—"}</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workspaces" className="space-y-6">
        <TabsList>
          <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantWorkspaces.map((workspace) => (
                  <TableRow key={workspace.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{workspace.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={workspace.status ?? "active"} />
                    </TableCell>
                    <TableCell className="text-slate-600">{workspace.slug}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="quotas">
          <div className="grid gap-6 md:grid-cols-2">
            {quotaEntries.map((quota) => {
              const percentage = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
              return (
                <Card key={quota.name} className="p-6">
                  <h3 className="font-semibold text-slate-900">{quota.name}</h3>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-semibold text-slate-900">
                          {quota.used}
                        </span>
                        <span className="ml-2 text-sm text-slate-600">
                          of {quota.limit} {quota.unit}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-600">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={percentage} className="mt-3 h-2" />
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-slate-900">Tenant Configuration</h3>
            <p className="mt-1 text-sm text-slate-600">
              Platform-level settings and governance controls
            </p>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="font-medium text-slate-900">Lifecycle Status</h4>
                <p className="mt-1 text-sm text-slate-600">Current tenant provisioning state</p>
                <div className="mt-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="font-medium text-slate-900">Billing Plan</h4>
                <p className="mt-1 text-sm text-slate-600">Enterprise Plan - Annual</p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
