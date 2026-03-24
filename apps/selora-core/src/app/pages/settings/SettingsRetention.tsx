import { Save, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { usePermissions } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import { workspaces as workspacesApi } from "../../../lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function SettingsRetention() {
  const permissions = usePermissions();
  const canEdit = permissions.canManageCompany;
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    screenshotsDays: "30",
    videosDays: "30",
    tracesDays: "90",
    logsDays: "90",
    auditDays: "730",
  });

  const retentionQuery = useQuery({
    queryKey: ["retention-settings", activeWorkspaceId],
    queryFn: () => workspacesApi.getRetention(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  useEffect(() => {
    const retention = retentionQuery.data;
    if (!retention) return;
    setForm({
      screenshotsDays: String(retention.screenshotsDays),
      videosDays: String(retention.videosDays),
      tracesDays: String(retention.tracesDays),
      logsDays: String(retention.logsDays),
      auditDays: String(retention.auditDays),
    });
  }, [retentionQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.updateRetention(activeWorkspaceId, {
        screenshotsDays: Number(form.screenshotsDays),
        videosDays: Number(form.videosDays),
        tracesDays: Number(form.tracesDays),
        logsDays: Number(form.logsDays),
        auditDays: Number(form.auditDays),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["retention-settings", activeWorkspaceId] });
      toast.success("Retention settings saved.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to save retention settings.";
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
          <h1 className="text-2xl font-semibold text-slate-900">Retention Policy</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure data retention windows for compliance and storage management
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !activeWorkspaceId}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Retention policies help manage storage costs and meet compliance requirements. Data older than specified retention periods will be automatically deleted.
        </AlertDescription>
      </Alert>

      {/* Test Artifacts */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Test Artifacts</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure retention for screenshots, videos, and trace files
        </p>
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="screenshots">Screenshots Retention (days)</Label>
              <Input
                id="screenshots"
                type="number"
                value={form.screenshotsDays}
                onChange={(event) => updateField("screenshotsDays", event.target.value)}
                disabled={!canEdit || saveMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="videos">Videos Retention (days)</Label>
              <Input
                id="videos"
                type="number"
                value={form.videosDays}
                onChange={(event) => updateField("videosDays", event.target.value)}
                disabled={!canEdit || saveMutation.isPending}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="traces">Trace Files Retention (days)</Label>
              <Input
                id="traces"
                type="number"
                value={form.tracesDays}
                onChange={(event) => updateField("tracesDays", event.target.value)}
                disabled={!canEdit || saveMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logs">Execution Logs Retention (days)</Label>
              <Input
                id="logs"
                type="number"
                value={form.logsDays}
                onChange={(event) => updateField("logsDays", event.target.value)}
                disabled={!canEdit || saveMutation.isPending}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Audit Retention</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure retention for audit trail and compliance logs
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="audit">Audit Events Retention (days)</Label>
          <Input
            id="audit"
            type="number"
            value={form.auditDays}
            onChange={(event) => updateField("auditDays", event.target.value)}
            disabled={!canEdit || saveMutation.isPending}
          />
          <p className="text-xs text-slate-500">
            Recommended: 2 years (730 days) for compliance requirements.
          </p>
        </div>
      </Card>

      {retentionQuery.isLoading && <p className="text-sm text-slate-500">Loading retention settings...</p>}
      {retentionQuery.error instanceof Error && (
        <p className="text-sm text-red-600">{retentionQuery.error.message}</p>
      )}
    </div>
  );
}
