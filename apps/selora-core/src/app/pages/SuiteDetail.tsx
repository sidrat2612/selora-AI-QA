import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, PlayCircle, Edit, Trash2, FileCheck2, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { StatusBadge } from "../components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { ExecutionPolicy } from "../components/suite-settings/ExecutionPolicy";
import { GitHubIntegration } from "../components/suite-settings/GitHubIntegration";
import { TestRailIntegration } from "../components/suite-settings/TestRailIntegration";
import { RolloutControls } from "../components/suite-settings/RolloutControls";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { license as licenseApi, suites as suitesApi, tests as testsApi, runs as runsApi, testCases as testCasesApi, testRailIntegration as testRailApi } from "../../lib/api-client";
import { CreateRunDialog } from "../components/CreateRunDialog";
import { CreateTestCaseDialog } from "../components/CreateTestCaseDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { toast } from "sonner";

export function SuiteDetail() {
  const { id } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createTestCaseOpen, setCreateTestCaseOpen] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const [suiteDescription, setSuiteDescription] = useState("");

  const suiteQuery = useQuery({
    queryKey: ["suite", activeWorkspaceId, id],
    queryFn: () => suitesApi.get(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const testsQuery = useQuery({
    queryKey: ["tests", activeWorkspaceId, { suiteId: id }],
    queryFn: () => testsApi.list(activeWorkspaceId!, { suiteId: id }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const runsQuery = useQuery({
    queryKey: ["runs", activeWorkspaceId, { suiteId: id }],
    queryFn: () => runsApi.list(activeWorkspaceId!, { suiteId: id }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const licenseQuery = useQuery({
    queryKey: ["license-status"],
    queryFn: () => licenseApi.getStatus(),
  });

  const testCasesQuery = useQuery({
    queryKey: ["test-cases", activeWorkspaceId, id],
    queryFn: () => testCasesApi.list(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const importTestCasesMutation = useMutation({
    mutationFn: () => testRailApi.importTestCases(activeWorkspaceId!, id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", activeWorkspaceId, id] });
      toast.success(`Imported ${data.importedCount} test cases from TestRail (${data.skippedCount} skipped).`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    },
  });

  const suite = suiteQuery.data;
  const suiteTests = testsQuery.data ?? [];
  const suiteRuns = runsQuery.data ?? [];
  const businessTestCases = testCasesQuery.data ?? [];

  const updateSuiteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !id) throw new Error("No suite selected.");
      return suitesApi.update(activeWorkspaceId, id, {
        name: suiteName.trim(),
        description: suiteDescription.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, id] });
      await queryClient.invalidateQueries({ queryKey: ["suites", activeWorkspaceId] });
      toast.success("Suite updated.");
      setEditOpen(false);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update suite.";
      toast.error(message);
    },
  });

  const deleteSuiteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !id) throw new Error("No suite selected.");
      return suitesApi.delete(activeWorkspaceId, id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suites", activeWorkspaceId] });
      toast.success("Suite archived.");
      window.location.assign("/suites");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to archive suite.";
      toast.error(message);
    },
  });

  if (!suite && suiteQuery.isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!suite) {
    return <div className="p-8 text-center text-slate-500">Suite not found</div>;
  }

  const openEditDialog = () => {
    setSuiteName(suite.name);
    setSuiteDescription(suite.description ?? "");
    setEditOpen(true);
  };

  const handleSaveSuite = () => {
    if (!suiteName.trim()) {
      toast.error("Suite name is required.");
      return;
    }
    updateSuiteMutation.mutate();
  };

  const handleDeleteSuite = () => {
    if (!window.confirm(`Archive suite ${suite.name}?`)) {
      return;
    }

    deleteSuiteMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link to="/suites">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Suites
        </Button>
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{suite.name}</h1>
          <p className="mt-2 text-sm text-slate-600">{suite.description ?? ""}</p>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
            <span>Created: {suite.createdAt}</span>
            <span>•</span>
            <span>{suite.testCount ?? suiteTests.length} tests</span>
          </div>
        </div>
        <div className="flex gap-2">
          {permissions.canAuthorAutomation && (
            <Button variant="outline" onClick={openEditDialog}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {permissions.canAuthorAutomation && (
            <Button variant="outline" onClick={handleDeleteSuite} disabled={deleteSuiteMutation.isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteSuiteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          )}
          {permissions.canOperateRuns && (
            <Button onClick={() => setRunDialogOpen(true)}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Suite
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Suite</DialogTitle>
            <DialogDescription>
              Update suite metadata for this collection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="suite-name-detail">Suite Name</Label>
              <Input id="suite-name-detail" value={suiteName} onChange={(event) => setSuiteName(event.target.value)} disabled={updateSuiteMutation.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suite-description-detail">Description</Label>
              <Input id="suite-description-detail" value={suiteDescription} onChange={(event) => setSuiteDescription(event.target.value)} disabled={updateSuiteMutation.isPending} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateSuiteMutation.isPending}>Cancel</Button>
            <Button onClick={handleSaveSuite} disabled={updateSuiteMutation.isPending}>
              {updateSuiteMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateRunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} defaultSuiteId={suite.id} />
      <CreateTestCaseDialog open={createTestCaseOpen} onOpenChange={setCreateTestCaseOpen} suiteId={suite.id} />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileCheck2 className="h-4 w-4" />
            <span>Total Tests</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{suite.testCount ?? suiteTests.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <PlayCircle className="h-4 w-4" />
            <span>Total Runs</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{suiteRuns.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <TrendingUp className="h-4 w-4" />
            <span>Status</span>
          </div>
          <div className="mt-2"><StatusBadge status={suite.status} /></div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="test-cases" className="space-y-6">
        <TabsList>
          <TabsTrigger value="test-cases">Test Cases ({businessTestCases.length})</TabsTrigger>
          <TabsTrigger value="tests">Scripts ({suiteTests.length})</TabsTrigger>
          <TabsTrigger value="runs">Run History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="test-cases">
          <Card>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-medium text-slate-700">Business Test Cases</h3>
              <div className="flex gap-2">
                {permissions.canAuthorAutomation && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => importTestCasesMutation.mutate()} disabled={importTestCasesMutation.isPending}>
                      {importTestCasesMutation.isPending ? "Importing..." : "Import from TestRail"}
                    </Button>
                    <Button size="sm" onClick={() => setCreateTestCaseOpen(true)}>
                      Create Test Case
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Mapped Scripts</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessTestCases.map((tc) => (
                  <TableRow key={tc.id}>
                    <TableCell>
                      <Link to={`/suites/${id}/test-cases/${tc.id}`} className="font-medium text-slate-900 hover:text-emerald-600">
                        {tc.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tc.priority === "CRITICAL" ? "border-red-300 text-red-700" : tc.priority === "HIGH" ? "border-orange-300 text-orange-700" : tc.priority === "LOW" ? "border-green-300 text-green-700" : ""}>
                        {tc.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{tc.format}</TableCell>
                    <TableCell>
                      {(tc.mappedScriptCount ?? 0) > 0 ? (
                        <Badge variant="secondary">{tc.mappedScriptCount} mapped</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">Not Covered</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{tc.source === "TESTRAIL_IMPORT" ? "TestRail" : "Manual"}</TableCell>
                    <TableCell>
                      <Link to={`/suites/${id}/test-cases/${tc.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {businessTestCases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                      No business test cases yet. Create one manually or import from TestRail.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="tests">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suiteTests.map((test) => (
                  <TableRow key={test.id}>
                    <TableCell>
                      <Link to={`/tests/${test.id}`} className="font-medium text-slate-900 hover:text-emerald-600">
                        {test.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={test.status} />
                    </TableCell>
                    <TableCell>
                      {test.lastRunStatus ? <StatusBadge status={test.lastRunStatus} /> : "—"}
                    </TableCell>
                    <TableCell>
                      <Link to={`/tests/${test.id}`}>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suiteRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link to={`/runs/${run.id}`} className="font-medium text-emerald-600 hover:underline">
                        {run.id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{run.createdAt}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="text-slate-600">{run.duration != null ? `${Math.round(run.duration / 1000)}s` : "—"}</TableCell>
                    <TableCell>
                      <Link to={`/runs/${run.id}`}>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-slate-900">Suite Settings</h3>
            <p className="mt-1 text-sm text-slate-600">Configure execution policy and integrations</p>
            <div className="mt-6 space-y-4">
              <ExecutionPolicy policy={suite.executionPolicy ?? null} />
              <GitHubIntegration licenseStatus={licenseQuery.data} integration={suite.linkedSystems?.github ?? null} />
              <TestRailIntegration licenseStatus={licenseQuery.data} integration={suite.linkedSystems?.testrail ?? null} />
              <RolloutControls rollout={suite.rollout ?? null} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}