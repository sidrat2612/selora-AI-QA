import { useState } from "react";
import { Link } from "react-router";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Upload,
  PlayCircle,
  Archive,
  CheckCircle2,
  Clock,
  GitBranch,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { StatusBadge } from "../components/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { type Test, tests as testsApi } from "../../lib/api-client";
import { UploadRecordingDialog } from "../components/UploadRecordingDialog";
import { CreateRunDialog } from "../components/CreateRunDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

function GitHubPublishBadge({ test }: { test: Test }) {
  const artifacts = (test as Record<string, unknown>)["generatedArtifacts"] as
    | Array<{ publication?: { status?: string; branchName?: string; pullRequestUrl?: string } | null }>
    | undefined;
  const pub = artifacts?.[0]?.publication;
  if (!pub) return <span className="text-xs text-slate-400">—</span>;

  const color =
    pub.status === "PUBLISHED"
      ? "bg-emerald-50 text-emerald-700"
      : pub.status === "FAILED"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

  const label = pub.status === "PUBLISHED" ? "Published" : pub.status === "FAILED" ? "Failed" : pub.status ?? "—";

  if (pub.pullRequestUrl) {
    return (
      <a
        href={pub.pullRequestUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color} hover:underline`}
      >
        <GitBranch className="h-3 w-3" />
        {label}
      </a>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      <GitBranch className="h-3 w-3" />
      {label}
    </span>
  );
}

export function Tests() {
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [testName, setTestName] = useState("");
  const [testDescription, setTestDescription] = useState("");
  const [testTags, setTestTags] = useState("");
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const testsQuery = useQuery({
    queryKey: ["tests", activeWorkspaceId],
    queryFn: () => testsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const tests = testsQuery.data ?? [];

  const updateTestMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !selectedTest) throw new Error("No test selected.");
      return testsApi.update(activeWorkspaceId, selectedTest.id, {
        name: testName.trim(),
        description: testDescription.trim() || null,
        tags: testTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tests", activeWorkspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["test", activeWorkspaceId, selectedTest?.id] });
      toast.success("Test metadata updated.");
      setEditOpen(false);
      setSelectedTest(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update test.";
      toast.error(message);
    },
  });

  const archiveTestMutation = useMutation({
    mutationFn: async (testIds: string[]) => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      await Promise.all(testIds.map((testId) => testsApi.update(activeWorkspaceId, testId, { status: "ARCHIVED" })));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tests", activeWorkspaceId] });
      setSelectedTests([]);
      toast.success("Test archive updated.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to archive tests.";
      toast.error(message);
    },
  });

  const filteredTests = tests.filter(test => {
    const matchesSearch = (test.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (test.suite?.name ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || test.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSelectAll = () => {
    if (selectedTests.length === filteredTests.length) {
      setSelectedTests([]);
    } else {
      setSelectedTests(filteredTests.map(t => t.id));
    }
  };

  const handleSelectTest = (id: string) => {
    setSelectedTests(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const openRunDialogForSuite = (suiteId?: string) => {
    if (!suiteId) {
      toast.error("This test is not assigned to a suite yet.");
      return;
    }

    setSelectedSuiteId(suiteId);
    setRunDialogOpen(true);
  };

  const handleRunSelected = () => {
    const selectedSuiteIds = Array.from(
      new Set(
        filteredTests
          .filter((test) => selectedTests.includes(test.id))
          .map((test) => test.suiteId)
          .filter((suiteId): suiteId is string => Boolean(suiteId)),
      ),
    );

    if (selectedSuiteIds.length !== 1) {
      toast.error("Run Selected currently supports tests from a single suite.");
      return;
    }

    openRunDialogForSuite(selectedSuiteIds[0]);
  };

  const openEditMetadata = (test: Test) => {
    setSelectedTest(test);
    setTestName(test.name ?? "");
    setTestDescription((test.description as string | undefined | null) ?? "");
    setTestTags(((test.tagsJson ?? []) as string[]).join(", "));
    setEditOpen(true);
  };

  const handleArchiveTests = (testIds: string[]) => {
    if (testIds.length === 0) {
      return;
    }

    if (!window.confirm(`Archive ${testIds.length} test${testIds.length === 1 ? "" : "s"}?`)) {
      return;
    }

    archiveTestMutation.mutate(testIds);
  };

  const handleSaveMetadata = () => {
    if (!testName.trim()) {
      toast.error("Test name is required.");
      return;
    }

    updateTestMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tests</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage and monitor all generated tests across suites
          </p>
        </div>
        <div className="flex gap-3">
          {permissions.canAuthorAutomation && (
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Recording
            </Button>
          )}
          {permissions.canOperateRuns && selectedTests.length > 0 && (
            <Button onClick={handleRunSelected}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Selected ({selectedTests.length})
            </Button>
          )}
        </div>
      </div>

      <UploadRecordingDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <CreateRunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} defaultSuiteId={selectedSuiteId} />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Test Metadata</DialogTitle>
            <DialogDescription>
              Update the test name, description, and tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-name">Test Name</Label>
              <Input id="test-name" value={testName} onChange={(event) => setTestName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-description">Description</Label>
              <Textarea id="test-description" value={testDescription} onChange={(event) => setTestDescription(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-tags">Tags</Label>
              <Input id="test-tags" value={testTags} onChange={(event) => setTestTags(event.target.value)} placeholder="checkout, smoke, auth" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateTestMutation.isPending}>Cancel</Button>
            <Button onClick={handleSaveMetadata} disabled={updateTestMutation.isPending}>
              {updateTestMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search tests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="validated">Validated</SelectItem>
              <SelectItem value="validating">Validating</SelectItem>
              <SelectItem value="needs_human_review">Needs Review</SelectItem>
              <SelectItem value="auto_repaired">Auto Repaired</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedTests.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-medium text-emerald-900">
            {selectedTests.length} test{selectedTests.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleRunSelected}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleArchiveTests(selectedTests)} disabled={archiveTestMutation.isPending}>
              <Archive className="mr-2 h-4 w-4" />
              {archiveTestMutation.isPending ? "Archiving..." : "Archive"}
            </Button>
          </div>
        </div>
      )}

      {/* Tests Table */}
      <div className="rounded-lg border border-slate-200 bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedTests.length === filteredTests.length && filteredTests.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Test Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Compatibility</TableHead>
              <TableHead>GitHub</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTests.map((test) => (
              <TableRow key={test.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedTests.includes(test.id)}
                    onCheckedChange={() => handleSelectTest(test.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    to={`/tests/${test.id}`}
                    className="font-medium text-slate-900 hover:text-emerald-600"
                  >
                    {test.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={test.status} />
                </TableCell>
                <TableCell>
                  <span className="text-slate-600">
                    {test.suite?.name ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">—</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-400">—</span>
                </TableCell>
                <TableCell>
                  <GitHubPublishBadge test={test} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/tests/${test.id}`}>View Details</Link>
                      </DropdownMenuItem>
                      {permissions.canOperateRuns && (
                        <DropdownMenuItem onClick={() => openRunDialogForSuite(test.suiteId)}>Run Test</DropdownMenuItem>
                      )}
                      <DropdownMenuItem asChild>
                        <Link to={`/tests/${test.id}`}>View History</Link>
                      </DropdownMenuItem>
                      {permissions.canAuthorAutomation && (
                        <DropdownMenuItem onClick={() => openEditMetadata(test)}>Edit Metadata</DropdownMenuItem>
                      )}
                      {permissions.canAuthorAutomation && (
                        <DropdownMenuItem onClick={() => handleArchiveTests([test.id])} className="text-red-600">Archive</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Showing {filteredTests.length} of {tests.length} tests
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
