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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tenants as tenantsApi, workspaces as workspacesApi, type Tenant, type Workspace } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export function PlatformAdmin() {
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Default Workspace");
  const [workspaceSlug, setWorkspaceSlug] = useState("default-workspace");
  const { memberships } = useAuth();
  const queryClient = useQueryClient();

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

  const createTenantMutation = useMutation({
    mutationFn: async () =>
      tenantsApi.create({
        name: tenantName.trim(),
        slug: tenantSlug.trim() || undefined,
        workspaceName: workspaceName.trim() || undefined,
        workspaceSlug: workspaceSlug.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["tenants-workspaces"] });
      toast.success("Tenant created.");
      setCreateOpen(false);
      setTenantName("");
      setTenantSlug("");
      setWorkspaceName("Default Workspace");
      setWorkspaceSlug("default-workspace");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create tenant.";
      toast.error(message);
    },
  });

  const handleCreateTenant = () => {
    if (!tenantName.trim()) {
      toast.error("Tenant name is required.");
      return;
    }

    createTenantMutation.mutate();
  };

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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Tenant
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tenant</DialogTitle>
            <DialogDescription>
              Provision a new tenant and its initial workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Tenant Name</Label>
              <Input id="tenant-name" value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Tenant Slug</Label>
              <Input id="tenant-slug" value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} placeholder="optional-auto-generated" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Initial Workspace Name</Label>
              <Input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-slug">Initial Workspace Slug</Label>
              <Input id="workspace-slug" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createTenantMutation.isPending}>Cancel</Button>
            <Button onClick={handleCreateTenant} disabled={createTenantMutation.isPending}>
              {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <div className="rounded-lg border border-slate-200 bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
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
                      to={`/tenants/${tenant.id}`}
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
                  <Link to={`/tenants/${tenant.id}`}>
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
