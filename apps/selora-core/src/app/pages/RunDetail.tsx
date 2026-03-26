import { useMemo } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Download, Square, GitBranch, Terminal } from "lucide-react";
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

  if (!runData && runQuery.isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!runData) {
    return <div className="p-8 text-center text-slate-500">Run not found</div>;
  }

  const passRate = runData.totalTests ? ((runData.passedTests ?? 0) / runData.totalTests) * 100 : 0;
  const durationStr = runData.duration != null ? `${Math.round(runData.duration / 1000)}s` : "—";
  const canCancelRun = useMemo(
    () => permissions.canOperateRuns && ["running", "queued", "RUNNING", "QUEUED"].includes(runData.status),
    [permissions.canOperateRuns, runData.status],
  );

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
            <h1 className="text-2xl font-semibold text-slate-900">Run {runData.id}</h1>
            <StatusBadge status={runData.status} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            <span className="font-medium text-emerald-600">{runData.suiteName ?? "Suite"}</span>
            {runData.environmentName && (
              <>
                {" • "}
                <Badge variant="outline" className="ml-1">{runData.environmentName}</Badge>
              </>
            )}
          </p>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
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
              <p className="text-sm text-slate-600">Pass Rate</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{passRate.toFixed(1)}%</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-100" />
          </div>
          <Progress value={passRate} className="mt-3 h-2" />
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Tests Passed</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{runData.passedTests ?? 0}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-100" />
          </div>
          <p className="mt-2 text-xs text-slate-600">of {runData.totalTests ?? 0} total</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Tests Failed</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{runData.failedTests ?? 0}</p>
            </div>
            <XCircle className="h-8 w-8 text-slate-100" />
          </div>
          <p className="mt-2 text-xs text-slate-600">of {runData.totalTests ?? 0} total</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Duration</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{durationStr}</p>
            </div>
            <Clock className="h-8 w-8 text-slate-100" />
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
                {runItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link to={`/tests/${item.testId}`} className="font-medium text-slate-900 hover:text-emerald-600">
                        {item.testTitle ?? item.testId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.status === "passed" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{item.duration != null ? `${Math.round(item.duration / 1000)}s` : "—"}</TableCell>
                    <TableCell>
                      <Link to={`/tests/${item.testId}`}>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {runItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500">No test results</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="console">
          <RunConsole runId={runData.id} items={runItems} runStatus={runData.status} />
        </TabsContent>

        <TabsContent value="lineage">
          <Card className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <div className="p-4 border-b">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-slate-600" />
                <h3 className="text-sm font-medium text-slate-700">Execution Source Lineage</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
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
                      <Link to={`/tests/${item.testId}`} className="font-medium text-slate-900 hover:text-emerald-600">
                        {item.testTitle ?? item.testId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.resolvedSourceMode?.replace(/_/g, " ") ?? "STORAGE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item.resolvedGitRef ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item.resolvedCommitSha ? item.resolvedCommitSha.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell>
                      {item.sourceFallbackReason ? (
                        <span className="text-xs text-amber-600">{item.sourceFallbackReason}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {runItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500">No test items</TableCell>
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
