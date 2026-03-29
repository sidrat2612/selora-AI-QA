import { useMemo } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Download, Square, GitBranch, Terminal, Image, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Progress } from "../components/ui/progress";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { runs as runsApi } from "../../lib/api-client";
import { toast } from "sonner";
import { RunConsole } from "../components/RunConsole";

export function RunDetail() {
  const { id } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const runQuery = useQuery({
    queryKey: ["run", activeWorkspaceId, id],
    queryFn: () => runsApi.get(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status?.toUpperCase();
      return status === "RUNNING" || status === "QUEUED" ? 3000 : false;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["runItems", activeWorkspaceId, id],
    queryFn: () => runsApi.listItems(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
    refetchInterval: (query) => {
      const runStatus = runQuery.data?.status?.toUpperCase();
      return runStatus === "RUNNING" || runStatus === "QUEUED" ? 3000 : false;
    },
  });

  const runData = runQuery.data;
  const runItems = itemsQuery.data ?? [];

  const cancelRunMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !id) throw new Error("No run selected.");
      return runsApi.cancel(activeWorkspaceId, id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["run", activeWorkspaceId, id] });
      await queryClient.invalidateQueries({ queryKey: ["runs", activeWorkspaceId] });
      toast.success("Run cancelled.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to cancel run.";
      toast.error(message);
    },
  });

  const passRate = runData?.totalCount ? ((runData.passedCount ?? 0) / runData.totalCount) * 100 : 0;
  const durationStr = runData?.durationMs != null ? `${Math.round(runData.durationMs / 1000)}s` : "—";
  const canCancelRun = useMemo(
    () => permissions.canOperateRuns && !!runData && ["running", "queued", "RUNNING", "QUEUED"].includes(runData.status),
    [permissions.canOperateRuns, runData?.status],
  );

  if (!runData && runQuery.isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (!runData) {
    return <div className="p-8 text-center text-muted-foreground">Run not found</div>;
  }

  const handleExportReport = () => {
    const report = {
      run: runData,
      items: runItems,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `selora-run-${runData.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Run report exported.");
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link to="/runs">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Runs
        </Button>
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Run {runData.id}</h1>
            <StatusBadge status={runData.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-primary">{runData.suite?.name ?? "Suite"}</span>
            {runData.environment?.name && (
              <>
                {" • "}
                <Badge variant="outline" className="ml-1">{runData.environment.name}</Badge>
              </>
            )}
          </p>
          <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {durationStr}
            </span>
            <span>•</span>
            <span>Started: {runData.startedAt ?? runData.createdAt}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canCancelRun && (
            <Button variant="outline" onClick={() => cancelRunMutation.mutate()} disabled={cancelRunMutation.isPending}>
              <Square className="mr-2 h-4 w-4" />
              {cancelRunMutation.isPending ? "Cancelling..." : "Cancel Run"}
            </Button>
          )}
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pass Rate</p>
              <p className="mt-1 text-2xl font-semibold text-success">{passRate.toFixed(1)}%</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-success/20" />
          </div>
          <Progress value={passRate} className="mt-3 h-2" />
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Tests Passed</p>
              <p className="mt-1 text-2xl font-semibold text-success">{runData.passedCount ?? 0}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-success/20" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">of {runData.totalCount ?? 0} total</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Tests Failed</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{runData.failedCount ?? 0}</p>
            </div>
            <XCircle className="h-8 w-8 text-muted-foreground/20" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">of {runData.totalCount ?? 0} total</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{durationStr}</p>
            </div>
            <Clock className="h-8 w-8 text-muted-foreground/20" />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="results" className="space-y-6">
        <TabsList>
          <TabsTrigger value="results">Test Results</TabsTrigger>
          <TabsTrigger value="console">
            <Terminal className="mr-2 h-4 w-4" />
            Console
          </TabsTrigger>
          <TabsTrigger value="artifacts">
            <Image className="mr-2 h-4 w-4" />
            Artifacts
          </TabsTrigger>
          <TabsTrigger value="lineage">Source Lineage</TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <Card className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runItems.map((item) => {
                  const itemDurationMs = item.startedAt && item.finishedAt
                    ? new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime()
                    : null;
                  return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link to={`/tests/${item.canonicalTestId}`} className="font-medium text-foreground hover:text-primary">
                        {item.canonicalTest?.name ?? item.canonicalTestId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.status === "PASSED" || item.status === "passed" ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{itemDurationMs != null ? `${Math.round(itemDurationMs / 1000)}s` : "—"}</TableCell>
                    <TableCell>
                      <Link to={`/tests/${item.canonicalTestId}`}>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {runItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No test results</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="console">
          <RunConsole runId={runData.id} items={runItems} runStatus={runData.status} />
        </TabsContent>

        <TabsContent value="artifacts">
          <Card className="p-6">
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 bg-surface-container-low rounded-full flex items-center justify-center mb-4">
                <Image className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Artifacts</h3>
              <p className="text-sm text-muted-foreground mb-4">Screenshots, videos, and trace files from this run</p>
              <p className="text-xs text-muted-foreground">Artifacts appear here after test execution completes</p>
            </div>
            {/* AI Repair Timeline */}
            {runItems.some(item => item.status === "auto_repaired" || item.status === "AUTO_REPAIRED") && (
              <div className="mt-6 border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-ai-accent" />
                  <h4 className="text-sm font-semibold text-foreground">AI Repair Timeline</h4>
                </div>
                <div className="space-y-3">
                  {runItems.filter(item => item.status === "auto_repaired" || item.status === "AUTO_REPAIRED").map(item => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-ai-accent-muted border border-ai-accent/20">
                      <Sparkles className="h-4 w-4 text-ai-accent mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.canonicalTest?.name ?? item.canonicalTestId}</p>
                        <p className="text-xs text-muted-foreground">Auto-repaired by AI during execution</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="lineage">
          <Card className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <div className="p-4 border-b">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">Execution Source Lineage</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Shows how each test was resolved for execution — storage artifact, git branch, or pinned commit.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Source Mode</TableHead>
                  <TableHead>Git Ref</TableHead>
                  <TableHead>Commit SHA</TableHead>
                  <TableHead>Fallback Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link to={`/tests/${item.canonicalTestId}`} className="font-medium text-foreground hover:text-primary">
                        {item.canonicalTest?.name ?? item.canonicalTestId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.resolvedSourceMode?.replace(/_/g, " ") ?? "STORAGE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.resolvedGitRef ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.resolvedCommitSha ? item.resolvedCommitSha.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell>
                      {item.sourceFallbackReason ? (
                        <span className="text-xs text-amber-600">{item.sourceFallbackReason}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {runItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No test items</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
