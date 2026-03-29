import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { usePermissions } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import { workspaces as workspacesApi } from "../../../lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function SettingsExecution() {
  const permissions = usePermissions();
  const canEdit = permissions.canManageCompany || permissions.canAuthorAutomation;
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    concurrentExecutionLimit: "",
    maxTestsPerRun: "",
    runCooldownSeconds: "",
  });

  const workspaceQuery = useQuery({
    queryKey: ["workspace-details", activeWorkspaceId],
    queryFn: () => workspacesApi.getDetails(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  useEffect(() => {
    const workspace = workspaceQuery.data;
    if (!workspace) return;
    setForm({
      concurrentExecutionLimit: String(workspace.concurrentExecutionLimit ?? ""),
      maxTestsPerRun: String(workspace.maxTestsPerRun ?? ""),
      runCooldownSeconds: String(workspace.runCooldownSeconds ?? ""),
    });
  }, [workspaceQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.updateSettings(activeWorkspaceId, {
        concurrentExecutionLimit: Number(form.concurrentExecutionLimit),
        maxTestsPerRun: Number(form.maxTestsPerRun),
        runCooldownSeconds: Number(form.runCooldownSeconds),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-details", activeWorkspaceId] });
      toast.success("Execution settings saved.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to save execution settings.";
      toast.error(message);
    },
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Execution Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure default execution policies, retry rules, and AI validation behavior
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !activeWorkspaceId}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground">Execution Capacity</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the execution limits enforced for the active workspace
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="concurrent-execution-limit">Concurrent Execution Limit</Label>
            <Input
              id="concurrent-execution-limit"
              type="number"
              value={form.concurrentExecutionLimit}
              onChange={(event) => updateField("concurrentExecutionLimit", event.target.value)}
              disabled={!canEdit || saveMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-tests-per-run">Maximum Tests Per Run</Label>
            <Input
              id="max-tests-per-run"
              type="number"
              value={form.maxTestsPerRun}
              onChange={(event) => updateField("maxTestsPerRun", event.target.value)}
              disabled={!canEdit || saveMutation.isPending}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground">Run Creation Cooldown</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how quickly users can start another run after the previous one is created
        </p>
        <div className="mt-6 max-w-md space-y-2">
          <div className="space-y-2">
            <Label htmlFor="run-cooldown-seconds">Run Cooldown (seconds)</Label>
            <Input
              id="run-cooldown-seconds"
              type="number"
              value={form.runCooldownSeconds}
              onChange={(event) => updateField("runCooldownSeconds", event.target.value)}
              disabled={!canEdit || saveMutation.isPending}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground">Applied Backend Settings</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These values are enforced by the backend when creating and operating runs
        </p>
        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
          <li>Concurrent execution limit caps active runs across the workspace.</li>
          <li>Maximum tests per run prevents oversized run requests.</li>
          <li>Run cooldown delays consecutive run creation to protect infrastructure.</li>
        </ul>
        {workspaceQuery.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading workspace settings...</p>}
        {workspaceQuery.error instanceof Error && (
          <p className="mt-4 text-sm text-destructive">{workspaceQuery.error.message}</p>
        )}
      </Card>
    </div>
  );
}
