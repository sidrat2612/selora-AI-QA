import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, PlayCircle, Archive, RefreshCw, Code, History, Info } from "lucide-react";
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
    if (!window.confirm(`Archive test ${testData.title}?`)) {
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
            <h1 className="text-2xl font-semibold text-slate-900">{testData.title}</h1>
            <StatusBadge status={testData.status} />
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
            {testData.suiteName && (
              <span>Suite: <span className="font-medium text-emerald-600">{testData.suiteName}</span></span>
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
            {testData.lastRunAt ?? "Never"}
          </p>
          {testData.lastRunStatus && (
            <div className="mt-1"><StatusBadge status={testData.lastRunStatus} /></div>
          )}
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="repairs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="repairs">
            <History className="mr-2 h-4 w-4" />
            Repair Attempts
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
      </Tabs>
    </div>
  );
}