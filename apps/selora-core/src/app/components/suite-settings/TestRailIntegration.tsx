import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle2, XCircle, Save, TestTube2, RefreshCw, ArrowDownToLine } from "lucide-react";
import type { LicenseStatus } from "@selora/domain";
import { isCommercialFeatureBlocked } from "../../../lib/license";
import { CommercialLicenseAlert } from "./CommercialLicenseAlert";
import { useParams } from "react-router";
import { useWorkspace } from "../../../lib/workspace-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { testRailIntegration as trApi } from "../../../lib/api-client";
import { toast } from "sonner";

type TestRailIntegrationProps = {
  licenseStatus?: LicenseStatus | null;
  suiteId?: string;
  integration?: {
    id: string;
    status: string;
    baseUrl?: string;
    projectId?: string;
    suiteIdExternal?: string;
    syncPolicy?: string;
    lastValidatedAt?: string | null;
    lastSyncedAt?: string | null;
    latestSync?: {
      status: string;
      totalCount: number;
      syncedCount: number;
      failedCount: number;
      startedAt?: string;
      finishedAt?: string;
    } | null;
  } | null;
};

export function TestRailIntegration({ licenseStatus, integration, suiteId: suiteIdProp }: TestRailIntegrationProps) {
  const params = useParams();
  const suiteId = suiteIdProp ?? params.id;
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const isLicenseBlocked = isCommercialFeatureBlocked(licenseStatus);

  const [baseUrl, setBaseUrl] = useState(integration?.baseUrl ?? "");
  const [projectId, setProjectId] = useState(integration?.projectId ?? "");
  const [suiteIdExt, setSuiteIdExt] = useState(integration?.suiteIdExternal ?? "");

  const connected = integration?.status === "CONNECTED";

  const saveMutation = useMutation({
    mutationFn: () => trApi.upsert(activeWorkspaceId!, suiteId!, { baseUrl, projectId, suiteIdExternal: suiteIdExt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("TestRail settings saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  const validateMutation = useMutation({
    mutationFn: () => trApi.validate(activeWorkspaceId!, suiteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("TestRail integration validated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Validation failed."),
  });

  const syncMutation = useMutation({
    mutationFn: () => trApi.sync(activeWorkspaceId!, suiteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("Sync initiated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed."),
  });

  const latestSync = integration?.latestSync;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <TestTube2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">TestRail Integration</h3>
              <p className="text-sm text-muted-foreground">Sync test results with TestRail</p>
            </div>
          </div>
          {connected ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              <XCircle className="mr-1 h-3 w-3" />
              {integration ? "Invalid" : "Not Connected"}
            </Badge>
          )}
        </div>

        {isLicenseBlocked && (
          <CommercialLicenseAlert>
            TestRail integration requires a commercial Selora license.
          </CommercialLicenseAlert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tr-base-url">TestRail URL</Label>
            <Input id="tr-base-url" placeholder="https://yourcompany.testrail.io" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={isLicenseBlocked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tr-project-id">Project ID</Label>
            <Input id="tr-project-id" placeholder="e.g., P123" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={isLicenseBlocked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tr-suite-id">Suite ID (external)</Label>
            <Input id="tr-suite-id" placeholder="e.g., S456" value={suiteIdExt} onChange={(e) => setSuiteIdExt(e.target.value)} disabled={isLicenseBlocked} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={() => saveMutation.mutate()} disabled={isLicenseBlocked || saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            {integration && (
              <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {validateMutation.isPending ? "Validating..." : "Re-validate"}
              </Button>
            )}
            {connected && (
              <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                {syncMutation.isPending ? "Syncing..." : "Sync Now"}
              </Button>
            )}
          </div>
        </div>

        {/* Sync Dashboard */}
        {latestSync && (
          <div className="border-t pt-4 space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Latest Sync Run</h4>
            <div className="flex items-center gap-3 text-sm">
              <Badge className={
                latestSync.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700" :
                latestSync.status === "FAILED" ? "bg-red-50 text-red-700" :
                latestSync.status === "RUNNING" ? "bg-blue-50 text-blue-700" :
                "bg-amber-50 text-amber-700"
              }>{latestSync.status}</Badge>
              <span className="text-slate-600">
                {latestSync.syncedCount}/{latestSync.totalCount} synced
                {latestSync.failedCount > 0 && `, ${latestSync.failedCount} failed`}
              </span>
            </div>
            {latestSync.startedAt && (
              <p className="text-xs text-slate-500">
                Started: {new Date(latestSync.startedAt).toLocaleString()}
                {latestSync.finishedAt && ` — Finished: ${new Date(latestSync.finishedAt).toLocaleString()}`}
              </p>
            )}
          </div>
        )}

        {integration?.lastSyncedAt && (
          <p className="text-xs text-slate-500">Last synced: {new Date(integration.lastSyncedAt).toLocaleString()}</p>
        )}
      </div>
    </Card>
  );
}
