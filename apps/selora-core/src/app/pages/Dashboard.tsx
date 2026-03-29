import { 
  TrendingUp, 
  FileCheck2, 
  AlertTriangle, 
  CheckCircle2,
  Upload,
  PlayCircle,
  Clock,
  Activity,
  BarChart3,
  XCircle,
} from "lucide-react";
import { KPICard } from "../components/KPICard";
import { Progress } from "../components/ui/progress";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Link } from "react-router";
import { Alert, AlertDescription } from "../components/ui/alert";
import { useState, useMemo } from "react";
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

  const healthMetrics = useMemo(() => {
    const allRuns = runsQuery.data ?? [];
    const passed = allRuns.filter((r) => r.status.toLowerCase() === "passed").length;
    const failed = allRuns.filter((r) => r.status.toLowerCase() === "failed").length;
    const running = allRuns.filter((r) =>
      ["running", "queued"].includes(r.status.toLowerCase()),
    ).length;
    const completed = passed + failed;
    const passRate = completed > 0 ? Math.round((passed / completed) * 100) : 0;
    const avgDuration =
      allRuns.filter((r) => r.durationMs != null).length > 0
        ? Math.round(
            allRuns.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) /
              allRuns.filter((r) => r.durationMs != null).length /
              1000,
          )
        : 0;

    return { passed, failed, running, completed, passRate, avgDuration, total: allRuns.length };
  }, [runsQuery.data]);

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

      {/* Alerts — show when usage data indicates > 80% consumption */}
      {usageQuery.data && typeof (usageQuery.data as Record<string, unknown>).usagePercent === "number" &&
        ((usageQuery.data as Record<string, unknown>).usagePercent as number) > 80 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Quota Warning:</strong> You've used {Math.round((usageQuery.data as Record<string, unknown>).usagePercent as number)}% of your monthly test execution minutes.
            <Link to="/settings/quotas" className="ml-2 font-medium underline">
              Review quotas
            </Link>
          </AlertDescription>
        </Alert>
      )}

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

      {/* Observability — Run Health Overview */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">Overall Pass Rate</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-emerald-600">{healthMetrics.passRate}%</span>
            <span className="text-sm text-slate-500 mb-1">of {healthMetrics.completed} completed runs</span>
          </div>
          <Progress value={healthMetrics.passRate} className="mt-3 h-2" />
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Run Breakdown</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Passed
              </span>
              <span className="font-medium">{healthMetrics.passed}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-red-600">
                <XCircle className="h-3.5 w-3.5" /> Failed
              </span>
              <span className="font-medium">{healthMetrics.failed}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-blue-600">
                <PlayCircle className="h-3.5 w-3.5" /> In Progress
              </span>
              <span className="font-medium">{healthMetrics.running}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Execution Metrics</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Total Runs</span>
              <span className="font-medium">{healthMetrics.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Avg Duration</span>
              <span className="font-medium">{healthMetrics.avgDuration > 0 ? `${healthMetrics.avgDuration}s` : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Total Tests</span>
              <span className="font-medium">{totalTests}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Active Suites</span>
              <span className="font-medium">{activeSuites}</span>
            </div>
          </div>
        </Card>
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
          <div className="mt-6 space-y-4 max-h-[400px] overflow-y-auto pr-1">
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
                      <p className="font-medium text-slate-900">{run.suite?.name ?? "Run"}</p>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                      {run.durationMs != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.round(run.durationMs / 1000)}s
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
          <div className="mt-6 space-y-4 max-h-[400px] overflow-y-auto pr-1">
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