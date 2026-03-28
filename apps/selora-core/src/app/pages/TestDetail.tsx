import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, PlayCircle, Archive, RefreshCw, Code, History, Info, GitBranch, Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { RepairAttemptsHistory } from "../components/RepairAttemptsHistory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { tests as testsApi } from "../../lib/api-client";
import { CreateRunDialog } from "../components/CreateRunDialog";
import { toast } from "sonner";

export function TestDetail() {
  const { id } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [runDialogOpen, setRunDialogOpen] = useState(false);

  const testQuery = useQuery({
    queryKey: ["test", activeWorkspaceId, id],
    queryFn: () => testsApi.get(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const repairsQuery = useQuery({
    queryKey: ["repairs", activeWorkspaceId, id],
    queryFn: () => testsApi.getRepairAttempts(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const testData = testQuery.data;
  const repairAttempts = repairsQuery.data ?? [];

  const archiveTestMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !id) throw new Error("No test selected.");
      return testsApi.update(activeWorkspaceId, id, { status: "ARCHIVED" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tests", activeWorkspaceId] });
      toast.success("Test archived.");
      window.location.assign("/tests");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to archive test.";
      toast.error(message);
    },
  });

  if (!testData && testQuery.isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!testData) {
    return <div className="p-8 text-center text-slate-500">Test not found</div>;
  }

  const handleRunTest = () => {
    if (!testData.suiteId) {
      toast.error("This test is not assigned to a suite yet.");
      return;
    }

    setRunDialogOpen(true);
  };

  const handleArchiveTest = () => {
    if (!window.confirm(`Archive test ${testData.name}?`)) {
      return;
    }

    archiveTestMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link to="/tests">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tests
        </Button>
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{testData.name}</h1>
            <StatusBadge status={testData.status} />
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
            {testData.suite?.name && (
              <span>Suite: <span className="font-medium text-emerald-600">{testData.suite.name}</span></span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {permissions.canAuthorAutomation && (
            <Button variant="outline" onClick={handleArchiveTest} disabled={archiveTestMutation.isPending}>
              <Archive className="mr-2 h-4 w-4" />
              {archiveTestMutation.isPending ? "Archiving..." : "Archive"}
            </Button>
          )}
          {permissions.canOperateRuns && (
            <Button onClick={handleRunTest}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Test
            </Button>
          )}
        </div>
      </div>

      <CreateRunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} defaultSuiteId={testData.suiteId} />

      {/* Metadata Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Info className="h-4 w-4" />
            <span>Status</span>
          </div>
          <div className="mt-2"><StatusBadge status={testData.status} /></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <History className="h-4 w-4" />
            <span>Last Run</span>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {testData.updatedAt ? new Date(testData.updatedAt).toLocaleString() : "Never"}
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="repairs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="repairs">
            <History className="mr-2 h-4 w-4" />
            Repair Attempts
          </TabsTrigger>
          <TabsTrigger value="versions">
            <GitBranch className="mr-2 h-4 w-4" />
            Version History
          </TabsTrigger>
          <TabsTrigger value="visual">
            <Eye className="mr-2 h-4 w-4" />
            <Link to={`/tests/${id}/visual`}>Visual Regression</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repairs">
          <RepairAttemptsHistory attempts={repairAttempts.map(r => ({
            id: r.id,
            date: r.createdAt,
            type: "auto" as const,
            issue: String(r.status),
            resolution: "",
            status: r.status === "success" ? "success" as const : "failed" as const,
          }))} />
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <div className="p-4 border-b">
              <h3 className="text-sm font-medium text-slate-700">Generated Test Artifacts</h3>
              <p className="mt-1 text-xs text-slate-500">History of all generated test versions for this recording</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(testData.generatedArtifacts ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      No generated artifacts yet. Upload a recording and generate a test script.
                    </TableCell>
                  </TableRow>
                ) : (
                  (testData.generatedArtifacts ?? []).map((artifact) => (
                    <TableRow key={artifact.id}>
                      <TableCell className="font-mono text-sm font-medium">v{artifact.version ?? 1}</TableCell>
                      <TableCell><StatusBadge status={artifact.status ?? "UNKNOWN"} /></TableCell>
                      <TableCell className="text-sm text-slate-600">{artifact.id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        {artifact.publication?.pullRequestUrl ? (
                          <a
                            href={artifact.publication.pullRequestUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-emerald-600 hover:underline"
                          >
                            PR #{artifact.publication.pullRequestUrl.split("/").pop()}
                          </a>
                        ) : artifact.publication?.status ? (
                          <Badge variant="outline">{artifact.publication.status}</Badge>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {artifact.createdAt ? new Date(artifact.createdAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}