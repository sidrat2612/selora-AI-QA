import { AlertTriangle, Archive, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { StatusBadge } from "../../components/StatusBadge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaces as workspacesApi } from "../../../lib/api-client";
import { useWorkspace } from "../../../lib/workspace-context";
import { usePermissions } from "../../../lib/auth-context";
import { toast } from "sonner";

export function SettingsLifecycle() {
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const { data: workspace } = useQuery({
    queryKey: ["workspace-details", activeWorkspaceId],
    queryFn: () => workspacesApi.getDetails(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.updateLifecycle(activeWorkspaceId, { status: "ARCHIVED" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-details", activeWorkspaceId] });
      toast.success("Workspace archived.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to archive workspace.";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.delete(activeWorkspaceId);
    },
    onSuccess: () => {
      toast.success("Workspace deleted.");
      window.location.assign("/");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to delete workspace.";
      toast.error(message);
    },
  });

  const handleArchive = () => {
    if (!workspace || archiveMutation.isPending) return;
    if (!window.confirm(`Archive workspace ${workspace.name}?`)) return;
    archiveMutation.mutate();
  };

  const handleDelete = () => {
    if (!workspace || deleteMutation.isPending) return;
    if (!window.confirm(`Delete workspace ${workspace.name}? This cannot be undone.`)) return;
    deleteMutation.mutate();
  };
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lifecycle Management</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage workspace lifecycle status and deletion controls
        </p>
      </div>

      {/* Current Status */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Workspace Status</h3>
            <p className="mt-1 text-sm text-slate-600">{workspace?.name ?? "Workspace"}</p>
          </div>
          <StatusBadge status={workspace?.status ?? "active"} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-600">Created</p>
            <p className="mt-1 font-medium text-slate-900">
              {workspace?.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Slug</p>
            <p className="mt-1 font-medium text-slate-900">{workspace?.slug ?? "—"}</p>
          </div>
        </div>
      </Card>

      {/* Actions */}
      {permissions.canManageCompany && (
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Workspace Actions</h3>
        <p className="mt-1 text-sm text-slate-600">
          Perform lifecycle operations on this workspace
        </p>
        <div className="mt-6 space-y-4">
          <div className="flex items-start justify-between rounded-lg border border-slate-200 p-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-slate-600" />
                <h4 className="font-medium text-slate-900">Archive Workspace</h4>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Preserve data but suspend all test execution and AI operations
              </p>
            </div>
            <Button variant="outline" onClick={handleArchive} disabled={archiveMutation.isPending || workspace?.status === "ARCHIVED"}>
              {archiveMutation.isPending ? "Archiving..." : "Archive"}
            </Button>
          </div>

          <div className="flex items-start justify-between rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-red-900">Delete Workspace</h4>
              </div>
              <p className="mt-1 text-sm text-red-700">
                Permanently delete all tests, runs, artifacts, and configuration
              </p>
            </div>
            <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </Card>
      )}

      {/* Warning */}
      {permissions.canManageCompany && (
      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>Warning:</strong> Deletion is permanent and cannot be undone. All data will be removed including tests, runs, artifacts, audit logs, and configuration.
        </AlertDescription>
      </Alert>
      )}
    </div>
  );
}
