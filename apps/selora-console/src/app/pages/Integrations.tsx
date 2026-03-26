import { useMemo } from "react";
import { Github, TestTube2, CheckCircle2, XCircle, Plug, RefreshCw } from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth-context";
import {
  tenants as tenantsApi,
  workspaces as workspacesApi,
  integrations as integrationsApi,
  type Workspace,
  type SuiteIntegrationSummary,
} from "../../lib/api-client";

function StatusDot({ status }: { status: string }) {
  if (status === "CONNECTED") {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (status === "DISCONNECTED") {
    return (
      <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
        <XCircle className="mr-1 h-3 w-3" /> Disconnected
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 text-xs">
      <XCircle className="mr-1 h-3 w-3" /> {status}
    </Badge>
  );
}

type WorkspaceIntegrations = {
  workspace: Workspace;
  tenantName: string;
  items: SuiteIntegrationSummary[];
};

export function Integrations() {
  const { memberships } = useAuth();

  const tenantIds = useMemo(() => {
    const ids = new Set(memberships.map((m) => m.tenantId));
    return Array.from(ids);
  }, [memberships]);

  const { data: tenantList = [] } = useQuery({
    queryKey: ["tenants", tenantIds],
    queryFn: () => Promise.all(tenantIds.map((id) => tenantsApi.get(id))),
    enabled: tenantIds.length > 0,
  });

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

  const allWorkspaces = useMemo(() => {
    const result: { workspace: Workspace; tenantName: string }[] = [];
    for (const tenant of tenantList) {
      const ws = workspacesByTenant[tenant.id] ?? [];
      for (const w of ws) {
        result.push({ workspace: w, tenantName: tenant.name });
      }
    }
    return result;
  }, [tenantList, workspacesByTenant]);

  const { data: workspaceIntegrations = [], isLoading } = useQuery({
    queryKey: ["platform-integrations", allWorkspaces.map((w) => w.workspace.id)],
    queryFn: async () => {
      const results: WorkspaceIntegrations[] = [];
      for (const { workspace, tenantName } of allWorkspaces) {
        try {
          const items = await integrationsApi.list(workspace.id);
          results.push({ workspace, tenantName, items });
        } catch {
          // workspace may not be accessible
        }
      }
      return results;
    },
    enabled: allWorkspaces.length > 0,
  });

  const allItems = workspaceIntegrations.flatMap((wi) =>
    wi.items.map((item) => ({
      ...item,
      workspaceName: wi.workspace.name,
      tenantName: wi.tenantName,
    })),
  );

  const githubCount = allItems.filter((i) => i.github !== null).length;
  const testrailCount = allItems.filter((i) => i.testrail !== null).length;
  const connectedGithub = allItems.filter((i) => i.github?.status === "CONNECTED").length;
  const connectedTestrail = allItems.filter((i) => i.testrail?.status === "CONNECTED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Overview of GitHub and TestRail integrations across all tenants and workspaces
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center">
              <Github className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{githubCount}</p>
              <p className="text-xs text-slate-500">GitHub Integrations</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{connectedGithub}</p>
              <p className="text-xs text-slate-500">GitHub Connected</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <TestTube2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{testrailCount}</p>
              <p className="text-xs text-slate-500">TestRail Integrations</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{connectedTestrail}</p>
              <p className="text-xs text-slate-500">TestRail Connected</p>
            </div>
          </div>
        </Card>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && allItems.length === 0 && (
        <Card className="p-12 text-center">
          <Plug className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No integrations configured</h3>
          <p className="mt-2 text-sm text-slate-500">
            No GitHub or TestRail integrations have been set up across any workspace.
          </p>
        </Card>
      )}

      {/* GitHub Table */}
      {githubCount > 0 && (
        <Card>
          <div className="p-4 border-b flex items-center gap-2">
            <Github className="h-5 w-5 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">GitHub Integrations</h2>
            <Badge variant="secondary" className="ml-1">{githubCount}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Suite</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Validated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems
                .filter((i) => i.github !== null)
                .map((item) => (
                  <TableRow key={item.suiteId + "-gh"}>
                    <TableCell className="text-sm">{item.tenantName}</TableCell>
                    <TableCell className="text-sm">{item.workspaceName}</TableCell>
                    <TableCell className="text-sm font-medium">{item.suiteName}</TableCell>
                    <TableCell className="text-sm">
                      {item.github!.repoOwner}/{item.github!.repoName}
                    </TableCell>
                    <TableCell className="text-sm">{item.github!.defaultBranch}</TableCell>
                    <TableCell><StatusDot status={item.github!.status} /></TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {item.github!.lastValidatedAt
                        ? new Date(item.github!.lastValidatedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* TestRail Table */}
      {testrailCount > 0 && (
        <Card>
          <div className="p-4 border-b flex items-center gap-2">
            <TestTube2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">TestRail Integrations</h2>
            <Badge variant="secondary" className="ml-1">{testrailCount}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Suite</TableHead>
                <TableHead>TestRail URL</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems
                .filter((i) => i.testrail !== null)
                .map((item) => (
                  <TableRow key={item.suiteId + "-tr"}>
                    <TableCell className="text-sm">{item.tenantName}</TableCell>
                    <TableCell className="text-sm">{item.workspaceName}</TableCell>
                    <TableCell className="text-sm font-medium">{item.suiteName}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]" title={item.testrail!.baseUrl}>
                      {item.testrail!.baseUrl}
                    </TableCell>
                    <TableCell className="text-sm">{item.testrail!.projectId}</TableCell>
                    <TableCell><StatusDot status={item.testrail!.status} /></TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {item.testrail!.lastSyncedAt
                        ? new Date(item.testrail!.lastSyncedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
