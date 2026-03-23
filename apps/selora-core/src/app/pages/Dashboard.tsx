import { 
  TrendingUp, 
  FileCheck2, 
  AlertTriangle, 
  CheckCircle2,
  Upload,
  PlayCircle,
  Clock,
} from "lucide-react";
import { KPICard } from "../components/KPICard";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Link } from "react-router";
import { Alert, AlertDescription } from "../components/ui/alert";
import { useState } from "react";
import { CreateRunDialog } from "../components/CreateRunDialog";
import { UploadRecordingDialog } from "../components/UploadRecordingDialog";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { runs as runsApi, usage as usageApi, tests as testsApi, suites as suitesApi } from "../../lib/api-client";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";

export function Dashboard() {
  const [isCreateRunDialogOpen, setCreateRunDialogOpen] = useState(false);
  const [isUploadRecordingDialogOpen, setUploadRecordingDialogOpen] = useState(false);
  const { activeWorkspaceId, activeTenantId } = useWorkspace();
  const permissions = usePermissions();

  const runsQuery = useQuery({
    queryKey: ["runs", activeWorkspaceId],
    queryFn: () => runsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const suitesQuery = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const testsQuery = useQuery({
    queryKey: ["tests", activeWorkspaceId],
    queryFn: () => testsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const usageQuery = useQuery({
    queryKey: ["usage", activeWorkspaceId],
    queryFn: () => usageApi.getWorkspaceUsage(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const recentRuns = (runsQuery.data ?? []).slice(0, 4);
  const totalTests = testsQuery.data?.length ?? 0;
  const activeSuites = suitesQuery.data?.length ?? 0;

  if (!activeWorkspaceId) {
    return <ErrorState message="No workspace selected" />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor test health, runs, and AI validation activity
          </p>
        </div>
        <div className="flex gap-3">
          {permissions.canAuthorAutomation && (
            <Button variant="outline" onClick={() => setUploadRecordingDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Recording
            </Button>
          )}
          {permissions.canOperateRuns && (
            <Button onClick={() => setCreateRunDialogOpen(true)}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Create Run
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>Quota Warning:</strong> You've used 85% of your monthly test execution minutes.
          <Link to="/settings/quotas" className="ml-2 font-medium underline">
            Review quotas
          </Link>
        </AlertDescription>
      </Alert>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Tests"
          value={String(totalTests)}
          icon={FileCheck2}
        />
        <KPICard
          title="Active Suites"
          value={String(activeSuites)}
          icon={TrendingUp}
        />
        <KPICard
          title="Recent Runs"
          value={String(runsQuery.data?.length ?? 0)}
          icon={CheckCircle2}
        />
        <KPICard
          title="Tests Needing Review"
          value={String(testsQuery.data?.filter(t => t.status === "needs_human_review").length ?? 0)}
          icon={AlertTriangle}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Runs */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent Runs</h3>
            <Link to="/runs">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {runsQuery.isLoading && <p className="text-sm text-slate-500">Loading...</p>}
            {recentRuns.length === 0 && !runsQuery.isLoading && (
              <p className="text-sm text-slate-500">No runs yet</p>
            )}
            {recentRuns.map((run) => (
              <Link
                key={run.id}
                to={`/runs/${run.id}`}
                className="block rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{run.suiteName ?? "Run"}</p>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                      {run.duration != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.round(run.duration / 1000)}s
                        </span>
                      )}
                      <span>{run.createdAt}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Suites Overview */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Test Suites</h3>
            <Link to="/suites">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {suitesQuery.isLoading && <p className="text-sm text-slate-500">Loading...</p>}
            {(suitesQuery.data ?? []).length === 0 && !suitesQuery.isLoading && (
              <p className="text-sm text-slate-500">No suites yet</p>
            )}
            {(suitesQuery.data ?? []).slice(0, 5).map((suite) => (
              <Link
                key={suite.id}
                to={`/suites/${suite.id}`}
                className="block rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{suite.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                      <StatusBadge status={suite.status} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Dialogs */}
      <CreateRunDialog open={isCreateRunDialogOpen} onOpenChange={setCreateRunDialogOpen} />
      <UploadRecordingDialog open={isUploadRecordingDialogOpen} onOpenChange={setUploadRecordingDialogOpen} />
    </div>
  );
}