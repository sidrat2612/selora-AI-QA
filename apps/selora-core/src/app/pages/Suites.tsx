import { Link } from "react-router";
import { Plus, Search, MoreHorizontal, FolderKanban, FileCheck2, PlayCircle, LayoutGrid, List } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useState } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { suites as suitesApi } from "../../lib/api-client";
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
import { toast } from "sonner";

export function Suites() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | undefined>();
  const [suiteName, setSuiteName] = useState("");
  const [suiteDescription, setSuiteDescription] = useState("");
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const suitesQuery = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const createSuiteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return suitesApi.create(activeWorkspaceId, {
        name: suiteName.trim(),
        description: suiteDescription.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suites", activeWorkspaceId] });
      toast.success("Suite created.");
      setCreateOpen(false);
      setSuiteName("");
      setSuiteDescription("");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create suite.";
      toast.error(message);
    },
  });

  const updateSuiteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !selectedSuiteId) throw new Error("No suite selected.");
      return suitesApi.update(activeWorkspaceId, selectedSuiteId, {
        name: suiteName.trim(),
        description: suiteDescription.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suites", activeWorkspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, selectedSuiteId] });
      toast.success("Suite updated.");
      setEditOpen(false);
      setSelectedSuiteId(undefined);
      setSuiteName("");
      setSuiteDescription("");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update suite.";
      toast.error(message);
    },
  });

  const deleteSuiteMutation = useMutation({
    mutationFn: async (suiteId: string) => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return suitesApi.delete(activeWorkspaceId, suiteId);
    },
    onSuccess: async (_, suiteId) => {
      await queryClient.invalidateQueries({ queryKey: ["suites", activeWorkspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("Suite archived.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to archive suite.";
      toast.error(message);
    },
  });

  const suites = suitesQuery.data ?? [];

  const filteredSuites = suites.filter(suite =>
    suite.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (suite.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateSuite = () => {
    if (!suiteName.trim()) {
      toast.error("Suite name is required.");
      return;
    }
    createSuiteMutation.mutate();
  };

  const openEditSuite = (suite: { id: string; name: string; description?: string }) => {
    setSelectedSuiteId(suite.id);
    setSuiteName(suite.name);
    setSuiteDescription(suite.description ?? "");
    setEditOpen(true);
  };

  const openRunSuite = (suiteId: string) => {
    setSelectedSuiteId(suiteId);
    setRunDialogOpen(true);
  };

  const handleSaveSuite = () => {
    if (!suiteName.trim()) {
      toast.error("Suite name is required.");
      return;
    }

    if (editOpen) {
      updateSuiteMutation.mutate();
      return;
    }

    createSuiteMutation.mutate();
  };

  const handleDeleteSuite = (suite: { id: string; name: string }) => {
    if (!window.confirm(`Archive suite ${suite.name}?`)) {
      return;
    }

    deleteSuiteMutation.mutate(suite.id);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Test Suites</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize and manage test collections for different workflows
          </p>
        </div>
        {permissions.canAuthorAutomation && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Suite
          </Button>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Suite</DialogTitle>
            <DialogDescription>
              Create a new automation suite in the active workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="suite-name">Suite Name</Label>
              <Input
                id="suite-name"
                placeholder="Release Readiness"
                value={suiteName}
                onChange={(event) => setSuiteName(event.target.value)}
                disabled={createSuiteMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suite-description">Description</Label>
              <Input
                id="suite-description"
                placeholder="Smoke and regression coverage for release-critical flows"
                value={suiteDescription}
                onChange={(event) => setSuiteDescription(event.target.value)}
                disabled={createSuiteMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSuiteMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveSuite} disabled={createSuiteMutation.isPending}>
              {createSuiteMutation.isPending ? "Creating..." : "Create Suite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setSelectedSuiteId(undefined);
            setSuiteName("");
            setSuiteDescription("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Suite</DialogTitle>
            <DialogDescription>
              Update the suite name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-suite-name">Suite Name</Label>
              <Input id="edit-suite-name" value={suiteName} onChange={(event) => setSuiteName(event.target.value)} disabled={updateSuiteMutation.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-suite-description">Description</Label>
              <Input id="edit-suite-description" value={suiteDescription} onChange={(event) => setSuiteDescription(event.target.value)} disabled={updateSuiteMutation.isPending} />
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

      <CreateRunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} defaultSuiteId={selectedSuiteId} />

      {/* Search + View Toggle */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search suites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center border border-border rounded-md">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <FolderKanban className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Suites</p>
              <p className="text-2xl font-semibold text-foreground">{suites.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-3">
              <FileCheck2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Tests</p>
              <p className="text-2xl font-semibold text-foreground">
                {suites.reduce((sum, s) => sum + (s.testCount ?? 0), 0)}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <PlayCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Pass Rate</p>
              <p className="text-2xl font-semibold text-foreground">—</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Suites View */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSuites.map((suite) => (
            <Card key={suite.id} className="p-6 transition-shadow hover:shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Link to={`/suites/${suite.id}`}>
                    <h3 className="font-semibold text-foreground hover:text-primary">
                      {suite.name}
                    </h3>
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {suite.description}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/suites/${suite.id}`}>View Details</Link>
                    </DropdownMenuItem>
                    {permissions.canOperateRuns && <DropdownMenuItem onClick={() => openRunSuite(suite.id)}>Run Suite</DropdownMenuItem>}
                    {permissions.canAuthorAutomation && <DropdownMenuItem onClick={() => openEditSuite(suite)}>Edit Suite</DropdownMenuItem>}
                    {permissions.canAuthorAutomation && <DropdownMenuItem onClick={() => handleDeleteSuite(suite)} className="text-destructive">Delete</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground font-medium">{suite.testCount ?? 0}</span>
                  <span className="text-muted-foreground">tests</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <StatusBadge status={suite.status} />
                </div>
                <Link to={`/suites/${suite.id}`}>
                  <Button variant="ghost" size="sm">View Suite</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {filteredSuites.map((suite) => (
              <div key={suite.id} className="flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <FolderKanban className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <Link to={`/suites/${suite.id}`} className="font-medium text-foreground hover:text-primary truncate block">
                      {suite.name}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">{suite.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-muted-foreground">{suite.testCount ?? 0} tests</span>
                  <StatusBadge status={suite.status} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/suites/${suite.id}`}>View Details</Link>
                      </DropdownMenuItem>
                      {permissions.canOperateRuns && <DropdownMenuItem onClick={() => openRunSuite(suite.id)}>Run Suite</DropdownMenuItem>}
                      {permissions.canAuthorAutomation && <DropdownMenuItem onClick={() => openEditSuite(suite)}>Edit Suite</DropdownMenuItem>}
                      {permissions.canAuthorAutomation && <DropdownMenuItem onClick={() => handleDeleteSuite(suite)} className="text-destructive">Delete</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
