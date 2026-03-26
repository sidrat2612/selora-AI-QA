import { useMemo, useState } from "react";
import { Plus, MoreHorizontal, Globe, Key } from "lucide-react";
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
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../../lib/workspace-context";
import { usePermissions } from "../../../lib/auth-context";
import { type Environment, workspaces as workspacesApi } from "../../../lib/api-client";
import { toast } from "sonner";

type EnvironmentFormState = {
  name: string;
  baseUrl: string;
  secretRef: string;
  secretValue: string;
  isDefault: boolean;
  testTimeoutMs: string;
  runTimeoutMs: string;
  maxRetries: string;
};

const EMPTY_FORM: EnvironmentFormState = {
  name: "",
  baseUrl: "",
  secretRef: "",
  secretValue: "",
  isDefault: false,
  testTimeoutMs: "30000",
  runTimeoutMs: "1800000",
  maxRetries: "0",
};

function toFormState(environment?: Environment): EnvironmentFormState {
  if (!environment) {
    return EMPTY_FORM;
  }

  return {
    name: environment.name,
    baseUrl: environment.baseUrl,
    secretRef: environment.secretRef ?? "",
    secretValue: "",
    isDefault: environment.isDefault,
    testTimeoutMs: String(environment.testTimeoutMs ?? 30000),
    runTimeoutMs: String(environment.runTimeoutMs ?? 1800000),
    maxRetries: String(environment.maxRetries ?? 0),
  };
}

export function SettingsEnvironments() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState<Environment | null>(null);
  const [createForm, setCreateForm] = useState<EnvironmentFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<EnvironmentFormState>(EMPTY_FORM);
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const envsQuery = useQuery({
    queryKey: ["environments", activeWorkspaceId],
    queryFn: () => workspacesApi.listEnvironments(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const environments = envsQuery.data ?? [];

  const defaultEnvironment = useMemo(
    () => environments.find((environment) => environment.isDefault) ?? null,
    [environments],
  );

  const invalidateEnvironments = async () => {
    await queryClient.invalidateQueries({ queryKey: ["environments", activeWorkspaceId] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");

      return workspacesApi.createEnvironment(activeWorkspaceId, {
        name: createForm.name.trim(),
        baseUrl: createForm.baseUrl.trim(),
        secretRef: createForm.secretRef.trim(),
        secretValue: createForm.secretValue.trim() || undefined,
        isDefault: createForm.isDefault,
        testTimeoutMs: Number(createForm.testTimeoutMs),
        runTimeoutMs: Number(createForm.runTimeoutMs),
        maxRetries: Number(createForm.maxRetries),
      });
    },
    onSuccess: async () => {
      await invalidateEnvironments();
      toast.success("Environment created.");
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create environment.";
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !editingEnvironment) throw new Error("No environment selected.");

      return workspacesApi.updateEnvironment(activeWorkspaceId, editingEnvironment.id, {
        name: editForm.name.trim(),
        baseUrl: editForm.baseUrl.trim(),
        secretRef: editForm.secretRef.trim(),
        secretValue: editForm.secretValue.trim() || undefined,
        isDefault: editForm.isDefault,
        testTimeoutMs: Number(editForm.testTimeoutMs),
        runTimeoutMs: Number(editForm.runTimeoutMs),
        maxRetries: Number(editForm.maxRetries),
      });
    },
    onSuccess: async () => {
      await invalidateEnvironments();
      toast.success("Environment updated.");
      setEditOpen(false);
      setEditingEnvironment(null);
      setEditForm(EMPTY_FORM);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update environment.";
      toast.error(message);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (environment: Environment) => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.updateEnvironment(activeWorkspaceId, environment.id, { isDefault: true });
    },
    onSuccess: async () => {
      await invalidateEnvironments();
      toast.success("Default environment updated.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update default environment.";
      toast.error(message);
    },
  });

  const updateCreateField = <K extends keyof EnvironmentFormState>(field: K, value: EnvironmentFormState[K]) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
  };

  const updateEditField = <K extends keyof EnvironmentFormState>(field: K, value: EnvironmentFormState[K]) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const validateEnvironmentForm = (form: EnvironmentFormState) => {
    if (!form.name.trim() || !form.baseUrl.trim() || !form.secretRef.trim()) {
      toast.error("Name, base URL, and secret reference are required.");
      return false;
    }

    return true;
  };

  const handleCreateEnvironment = () => {
    if (!validateEnvironmentForm(createForm)) return;
    createMutation.mutate();
  };

  const openEditDialog = (environment: Environment) => {
    setEditingEnvironment(environment);
    setEditForm(toFormState(environment));
    setEditOpen(true);
  };

  const handleUpdateEnvironment = () => {
    if (!validateEnvironmentForm(editForm)) return;
    updateMutation.mutate();
  };

  const renderEnvironmentForm = (
    form: EnvironmentFormState,
    updateField: <K extends keyof EnvironmentFormState>(field: K, value: EnvironmentFormState[K]) => void,
    isEditing = false,
    isPending = false,
  ) => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor={isEditing ? "env-name-edit" : "env-name"}>Environment Name</Label>
        <Input
          id={isEditing ? "env-name-edit" : "env-name"}
          placeholder="Production"
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={isEditing ? "base-url-edit" : "base-url"}>Base URL</Label>
        <Input
          id={isEditing ? "base-url-edit" : "base-url"}
          type="url"
          placeholder="https://app.example.com"
          value={form.baseUrl}
          onChange={(event) => updateField("baseUrl", event.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={isEditing ? "secret-ref-edit" : "secret-ref"}>Secret Reference</Label>
        <Input
          id={isEditing ? "secret-ref-edit" : "secret-ref"}
          placeholder="prod-api-key"
          value={form.secretRef}
          onChange={(event) => updateField("secretRef", event.target.value)}
          disabled={isPending}
        />
        <p className="text-xs text-slate-500">Reference to stored credentials. Values are never returned to the UI.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={isEditing ? "secret-value-edit" : "secret-value"}>Secret Value {isEditing ? "(optional)" : ""}</Label>
        <Input
          id={isEditing ? "secret-value-edit" : "secret-value"}
          type="password"
          placeholder={isEditing ? "Leave blank to keep the current stored secret" : "Paste secret value to encrypt and store it"}
          value={form.secretValue}
          onChange={(event) => updateField("secretValue", event.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={isEditing ? "test-timeout-edit" : "test-timeout"}>Test Timeout (ms)</Label>
          <Input
            id={isEditing ? "test-timeout-edit" : "test-timeout"}
            type="number"
            value={form.testTimeoutMs}
            onChange={(event) => updateField("testTimeoutMs", event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={isEditing ? "run-timeout-edit" : "run-timeout"}>Run Timeout (ms)</Label>
          <Input
            id={isEditing ? "run-timeout-edit" : "run-timeout"}
            type="number"
            value={form.runTimeoutMs}
            onChange={(event) => updateField("runTimeoutMs", event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={isEditing ? "max-retries-edit" : "max-retries"}>Max Retries</Label>
          <Input
            id={isEditing ? "max-retries-edit" : "max-retries"}
            type="number"
            value={form.maxRetries}
            onChange={(event) => updateField("maxRetries", event.target.value)}
            disabled={isPending}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Set as Default</Label>
          <p className="text-xs text-slate-500">Use this environment by default for new runs.</p>
        </div>
        <Switch checked={form.isDefault} onCheckedChange={(checked) => updateField("isDefault", checked)} disabled={isPending} />
      </div>
    </div>
  );

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
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Environment
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Environment</DialogTitle>
                <DialogDescription>
                  Add a new environment for test execution.
                </DialogDescription>
              </DialogHeader>
              {renderEnvironmentForm(createForm, updateCreateField, false, createMutation.isPending)}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
                <Button onClick={handleCreateEnvironment} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Environment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Environment</DialogTitle>
            <DialogDescription>
              Update the selected environment configuration.
            </DialogDescription>
          </DialogHeader>
          {renderEnvironmentForm(editForm, updateEditField, true, updateMutation.isPending)}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                setEditingEnvironment(null);
                setEditForm(EMPTY_FORM);
              }}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateEnvironment} disabled={updateMutation.isPending || !editingEnvironment}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Total Environments</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{environments.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Default Environment</p>
          <p className="mt-1 text-base font-medium text-slate-900">
            {defaultEnvironment?.name ?? "None"}
          </p>
        </Card>
      </div>

      {/* Environments Table */}
      <div className="rounded-lg border border-slate-200 bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>Timeouts</TableHead>
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
                  <div className="space-y-1 text-xs text-slate-600">
                    <div>Test: {env.testTimeoutMs ?? 30000} ms</div>
                    <div>Run: {env.runTimeoutMs ?? 1800000} ms</div>
                    <div>Retries: {env.maxRetries ?? 0}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {permissions.canManageEnvironments && (
                        <DropdownMenuItem onClick={() => openEditDialog(env)}>Edit Environment</DropdownMenuItem>
                      )}
                      {permissions.canManageEnvironments && !env.isDefault && (
                        <DropdownMenuItem onClick={() => setDefaultMutation.mutate(env)} disabled={setDefaultMutation.isPending}>
                          Set as Default
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {envsQuery.isLoading && <p className="text-sm text-slate-500">Loading environments...</p>}
      {envsQuery.error instanceof Error && (
        <p className="text-sm text-red-600">{envsQuery.error.message}</p>
      )}

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
