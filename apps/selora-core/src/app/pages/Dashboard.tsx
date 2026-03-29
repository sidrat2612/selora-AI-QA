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
  Sparkles,
  Wrench,
  Gauge,
} from "lucide-react";
import { KPICard } from "../components/KPICard";
import { Progress } from "../components/ui/progress";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Link } from "react-router";
import { useState, useMemo } from "react";
import { AlertBanners } from "../components/AlertBanners";
import type { AlertBannerItem } from "../components/AlertBanners";
import { CreateRunDialog } from "../components/CreateRunDialog";
import { UploadRecordingDialog } from "../components/UploadRecordingDialog";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { runs as runsApi, usage as usageApi, tests as testsApi, suites as suitesApi } from "../../lib/api-client";
import { LoadingState } from "../components/LoadingState";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";

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

  const isInitialLoad = runsQuery.isLoading && suitesQuery.isLoading && testsQuery.isLoading;
  if (isInitialLoad) {
    return <DashboardSkeleton />;
  }

  const isEmpty = totalTests === 0 && activeSuites === 0 && (runsQuery.data?.length ?? 0) === 0;
  if (isEmpty && !runsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor test health, runs, and AI validation activity
          </p>
        </div>
        <Card className="p-12">
          <div className="text-center max-w-lg mx-auto">
            <div className="h-1 w-32 bg-gradient-to-r from-primary via-emerald-400 to-primary mx-auto mb-8 rounded-full" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome to Selora</h2>
            <p className="text-muted-foreground mb-8">
              Get started by creating your first test suite or uploading a browser recording for AI-powered test generation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              {permissions.canAuthorAutomation && (
                <>
                  <Button onClick={() => setUploadRecordingDialogOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Recording
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/suites">Create Suite</Link>
                  </Button>
                </>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3 mt-8 pt-8 border-t border-border">
              <div className="text-center p-4">
                <div className="mx-auto w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">1. Upload</h4>
                <p className="mt-1 text-xs text-muted-foreground">Record your browser session and upload it</p>
              </div>
              <div className="text-center p-4">
                <div className="mx-auto w-10 h-10 bg-ai-accent/10 rounded-full flex items-center justify-center mb-3">
                  <Sparkles className="h-5 w-5 text-ai-accent" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">2. AI Generates</h4>
                <p className="mt-1 text-xs text-muted-foreground">AI creates validated test cases automatically</p>
              </div>
              <div className="text-center p-4">
                <div className="mx-auto w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <PlayCircle className="h-5 w-5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">3. Execute</h4>
                <p className="mt-1 text-xs text-muted-foreground">Run tests across environments with one click</p>
              </div>
            </div>
          </div>
        </Card>
        <CreateRunDialog open={isCreateRunDialogOpen} onOpenChange={setCreateRunDialogOpen} />
        <UploadRecordingDialog open={isUploadRecordingDialogOpen} onOpenChange={setUploadRecordingDialogOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
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

      {/* Alert Banners */}
      <AlertBanners alerts={(() => {
        const items: AlertBannerItem[] = [];
        if (usageQuery.data && typeof (usageQuery.data as Record<string, unknown>).usagePercent === "number") {
          const pct = (usageQuery.data as Record<string, unknown>).usagePercent as number;
          if (pct > 95) {
            items.push({
              id: "quota-critical",
              severity: "critical",
              message: `You've used ${Math.round(pct)}% of your monthly test execution minutes. Runs may be paused soon.`,
              linkText: "Upgrade quota",
              linkTo: "/settings/quotas",
            });
          } else if (pct > 80) {
            items.push({
              id: "quota-warning",
              severity: "warning",
              message: `You've used ${Math.round(pct)}% of your monthly test execution minutes.`,
              linkText: "Review quotas",
              linkTo: "/settings/quotas",
            });
          }
        }
        if (healthMetrics.failed > 0 && healthMetrics.total > 0 && (healthMetrics.failed / healthMetrics.total) > 0.5) {
          items.push({
            id: "failure-rate",
            severity: "critical",
            message: `${healthMetrics.failed} of ${healthMetrics.total} recent runs failed. Check your test configurations.`,
            linkText: "View failed runs",
            linkTo: "/runs?status=failed",
          });
        }
        return items;
      })() } />

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
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Overall Pass Rate</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-primary">{healthMetrics.passRate}%</span>
            <span className="text-sm text-muted-foreground mb-1">of {healthMetrics.completed} completed runs</span>
          </div>
          <Progress value={healthMetrics.passRate} className="mt-3 h-2" />
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Run Breakdown</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Passed
              </span>
              <span className="font-medium">{healthMetrics.passed}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-destructive">
                <XCircle className="h-3.5 w-3.5" /> Failed
              </span>
              <span className="font-medium">{healthMetrics.failed}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-warning">
                <PlayCircle className="h-3.5 w-3.5" /> In Progress
              </span>
              <span className="font-medium">{healthMetrics.running}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Execution Metrics</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Runs</span>
              <span className="font-medium">{healthMetrics.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg Duration</span>
              <span className="font-medium">{healthMetrics.avgDuration > 0 ? `${healthMetrics.avgDuration}s` : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Tests</span>
              <span className="font-medium">{totalTests}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Suites</span>
              <span className="font-medium">{activeSuites}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Intelligence & Quota Widgets */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Validation Funnel */}
        <Card className="p-6 bg-ai-accent-muted border-ai-accent/20">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-ai-accent" />
            <h3 className="text-sm font-semibold text-foreground">AI Validation Funnel</h3>
          </div>
          <div className="space-y-3">
            {(() => {
              const tests = testsQuery.data ?? [];
              const generated = tests.filter(t => t.status === "generated").length;
              const validating = tests.filter(t => t.status === "validating").length;
              const validated = tests.filter(t => t.status === "validated").length;
              const repaired = tests.filter(t => t.status === "auto_repaired").length;
              const needsReview = tests.filter(t => t.status === "needs_human_review").length;
              return (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Generated</span>
                    <span className="font-medium text-ai-accent">{generated}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Validating</span>
                    <span className="font-medium text-warning">{validating}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Validated</span>
                    <span className="font-medium text-success">{validated}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Auto-Repaired</span>
                    <span className="font-medium text-ai-accent">{repaired}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Needs Review</span>
                    <span className="font-medium text-destructive">{needsReview}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Self-Healing Ticker */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-4 w-4 text-ai-accent" />
            <h3 className="text-sm font-semibold text-foreground">AI Self-Healing</h3>
          </div>
          <div className="space-y-3">
            {(() => {
              const tests = testsQuery.data ?? [];
              const repaired = tests.filter(t => t.status === "auto_repaired");
              const repairedCount = repaired.length;
              return (
                <>
                  <div className="text-3xl font-bold text-ai-accent">{repairedCount}</div>
                  <p className="text-sm text-muted-foreground">tests auto-repaired by AI</p>
                  <div className="mt-4 space-y-2">
                    {repaired.slice(0, 3).map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Wrench className="h-3 w-3 text-ai-accent" />
                        <span className="truncate">{t.name}</span>
                      </div>
                    ))}
                    {repairedCount === 0 && (
                      <p className="text-xs text-muted-foreground">No repairs yet</p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Quota Widget */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Quota Utilization</h3>
          </div>
          {(() => {
            const pct = typeof (usageQuery.data as Record<string, unknown>)?.usagePercent === "number"
              ? (usageQuery.data as Record<string, unknown>).usagePercent as number
              : 0;
            const colorClass = pct > 90 ? "text-destructive" : pct > 75 ? "text-warning" : "text-primary";
            return (
              <>
                <div className={`text-3xl font-bold ${colorClass}`}>{Math.round(pct)}%</div>
                <p className="text-sm text-muted-foreground mb-3">of monthly execution minutes</p>
                <Progress value={pct} className="h-2" />
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Remaining: {Math.max(0, 100 - Math.round(pct))}%</span>
                  <Link to="/settings/quotas" className="text-primary hover:underline">Manage</Link>
                </div>
              </>
            );
          })()}
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Runs */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Recent Runs</h3>
            <Link to="/runs">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          <div className="mt-6 space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {runsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {recentRuns.length === 0 && !runsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">No runs yet</p>
            )}
            {recentRuns.map((run) => (
              <Link
                key={run.id}
                to={`/runs/${run.id}`}
                className="block rounded-lg border border-border p-4 transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{run.suite?.name ?? "Run"}</p>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
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
            <h3 className="text-base font-semibold text-foreground">Test Suites</h3>
            <Link to="/suites">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          <div className="mt-6 space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {suitesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {(suitesQuery.data ?? []).length === 0 && !suitesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">No suites yet</p>
            )}
            {(suitesQuery.data ?? []).slice(0, 5).map((suite) => (
              <Link
                key={suite.id}
                to={`/suites/${suite.id}`}
                className="block rounded-lg border border-border p-4 transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{suite.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
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