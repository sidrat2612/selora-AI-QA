import { useState } from "react";
import { Plus, MoreHorizontal, Globe, Key, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../../lib/workspace-context";
import { usePermissions } from "../../../lib/auth-context";
import { workspaces as workspacesApi } from "../../../lib/api-client";

export function SettingsEnvironments() {
  const [createOpen, setCreateOpen] = useState(false);
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();

  const envsQuery = useQuery({
    queryKey: ["environments", activeWorkspaceId],
    queryFn: () => workspacesApi.listEnvironments(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const environments = envsQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Environments</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure test execution environments with secure credential management
          </p>
        </div>
        {permissions.canManageEnvironments && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Environment
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Environment</DialogTitle>
              <DialogDescription>
                Add a new environment for test execution
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="env-name">Environment Name</Label>
                <Input id="env-name" placeholder="Production" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="base-url">Base URL</Label>
                <Input id="base-url" type="url" placeholder="https://app.example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret-ref">Secret Reference</Label>
                <Input id="secret-ref" placeholder="prod-api-key" />
                <p className="text-xs text-slate-500">
                  Reference to stored credentials (values not exposed in UI)
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Set as Default</Label>
                  <p className="text-xs text-slate-500">Use this environment by default for new runs</p>
                </div>
                <Switch />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => setCreateOpen(false)}>Create Environment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Total Environments</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{environments.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Default Environment</p>
          <p className="mt-1 text-base font-medium text-slate-900">
            {environments.find(e => e.isDefault)?.name ?? "None"}
          </p>
        </Card>
      </div>

      {/* Environments Table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {environments.map((env) => (
              <TableRow key={env.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-900">{env.name}</span>
                    {env.isDefault && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        Default
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {env.baseUrl}
                  </code>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {permissions.canManageEnvironments && <DropdownMenuItem>Edit Environment</DropdownMenuItem>}
                      <DropdownMenuItem>Validate Tests</DropdownMenuItem>
                      {permissions.canManageEnvironments && <DropdownMenuItem>Set as Default</DropdownMenuItem>}
                      {permissions.canManageEnvironments && <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Info Card */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Secure Credential Management</h3>
        <p className="mt-2 text-sm text-slate-600">
          Environment credentials are stored securely and never exposed in the UI. Secret references provide a safe way to manage API keys, tokens, and other sensitive configuration without directly handling the values.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="rounded-lg bg-green-50 p-2">
            <Key className="h-4 w-4 text-green-600" />
          </div>
          <p className="text-sm text-slate-900">
            All secrets are encrypted at rest and in transit
          </p>
        </div>
      </Card>
    </div>
  );
}
