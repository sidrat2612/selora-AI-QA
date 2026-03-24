import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Link2,
  Plus,
  Unlink,
  ExternalLink,
} from "lucide-react";
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
import { Textarea } from "../components/ui/textarea";
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
import { testCases as testCasesApi } from "../../lib/api-client";
import { MapScriptDialog } from "../components/MapScriptDialog";
import { toast } from "sonner";

const priorityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-green-100 text-green-800",
};

export function TestCaseDetail() {
  const { suiteId, testCaseId } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [mapScriptOpen, setMapScriptOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<string>("MEDIUM");
  const [editPreconditions, setEditPreconditions] = useState("");
  const [editExpectedResult, setEditExpectedResult] = useState("");

  const testCaseQuery = useQuery({
    queryKey: ["test-case", activeWorkspaceId, suiteId, testCaseId],
    queryFn: () => testCasesApi.get(activeWorkspaceId!, suiteId!, testCaseId!),
    enabled: !!activeWorkspaceId && !!suiteId && !!testCaseId,
  });

  const testCase = testCaseQuery.data;

  const updateMutation = useMutation({
    mutationFn: () =>
      testCasesApi.update(activeWorkspaceId!, suiteId!, testCaseId!, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        preconditions: editPreconditions.trim() || undefined,
        expectedResult: editExpectedResult.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["test-case", activeWorkspaceId, suiteId, testCaseId],
      });
      queryClient.invalidateQueries({
        queryKey: ["test-cases", activeWorkspaceId, suiteId],
      });
      toast.success("Test case updated.");
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => testCasesApi.delete(activeWorkspaceId!, suiteId!, testCaseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["test-cases", activeWorkspaceId, suiteId],
      });
      toast.success("Test case archived.");
      window.location.assign(`/suites/${suiteId}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to archive.");
    },
  });

  const removeMappingMutation = useMutation({
    mutationFn: (mappingId: string) =>
      testCasesApi.removeMapping(activeWorkspaceId!, suiteId!, testCaseId!, mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["test-case", activeWorkspaceId, suiteId, testCaseId],
      });
      toast.success("Script mapping removed.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove mapping.");
    },
  });

  if (!testCase && testCaseQuery.isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!testCase) {
    return <div className="p-8 text-center text-slate-500">Test case not found</div>;
  }

  const openEditDialog = () => {
    setEditTitle(testCase.title);
    setEditDescription(testCase.description ?? "");
    setEditPriority(testCase.priority);
    setEditPreconditions(testCase.preconditions ?? "");
    setEditExpectedResult(testCase.expectedResult ?? "");
    setEditOpen(true);
  };

  const handleDelete = () => {
    if (!window.confirm(`Archive test case "${testCase.title}"?`)) return;
    deleteMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Link to={`/suites/${suiteId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Suite
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {testCase.title}
            </h1>
            <Badge className={priorityColors[testCase.priority] ?? ""}>
              {testCase.priority}
            </Badge>
            <Badge variant="outline">{testCase.format}</Badge>
            {testCase.source === "TESTRAIL_IMPORT" && (
              <Badge variant="secondary">
                <ExternalLink className="mr-1 h-3 w-3" />
                TestRail Import
              </Badge>
            )}
          </div>
          {testCase.description && (
            <p className="mt-2 text-sm text-slate-600">{testCase.description}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
            <span>Created: {testCase.createdAt}</span>
            <span>•</span>
            <span>{testCase.mappedScriptCount ?? 0} mapped scripts</span>
          </div>
        </div>
        <div className="flex gap-2">
          {permissions.canAuthorAutomation && (
            <>
              <Button variant="outline" onClick={openEditDialog}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteMutation.isPending ? "Archiving..." : "Archive"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Test Case</DialogTitle>
            <DialogDescription>Update test case details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={editPriority}
                onValueChange={setEditPriority}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Preconditions</Label>
              <Textarea
                value={editPreconditions}
                onChange={(e) => setEditPreconditions(e.target.value)}
                rows={2}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>Expected Result</Label>
              <Textarea
                value={editExpectedResult}
                onChange={(e) => setEditExpectedResult(e.target.value)}
                rows={2}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-slate-600">Mapped Scripts</div>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {testCase.mappedScriptCount ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-600">Format</div>
          <p className="mt-1 text-lg font-medium text-slate-900">
            {testCase.format}
          </p>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-600">Status</div>
          <div className="mt-1">
            <StatusBadge status={testCase.status} />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="mappings">
            Mapped Scripts ({testCase.mappedScripts?.length ?? 0})
          </TabsTrigger>
          {(testCase.externalLinks?.length ?? 0) > 0 && (
            <TabsTrigger value="external">External Links</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details">
          <Card className="p-6 space-y-4">
            {testCase.preconditions && (
              <div>
                <h4 className="text-sm font-medium text-slate-700">
                  Preconditions
                </h4>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">
                  {testCase.preconditions}
                </p>
              </div>
            )}
            {testCase.expectedResult && (
              <div>
                <h4 className="text-sm font-medium text-slate-700">
                  Expected Result
                </h4>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">
                  {testCase.expectedResult}
                </p>
              </div>
            )}
            {testCase.steps && Array.isArray(testCase.steps) && testCase.steps.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-700">Steps</h4>
                <ol className="mt-1 list-decimal list-inside space-y-1 text-sm text-slate-600">
                  {testCase.steps.map((step, i) => (
                    <li key={i}>
                      {typeof step === "string"
                        ? step
                        : typeof step === "object" && step !== null
                          ? String((step as Record<string, unknown>)["description"] ?? JSON.stringify(step))
                          : String(step)}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!testCase.preconditions &&
              !testCase.expectedResult &&
              (!testCase.steps || !Array.isArray(testCase.steps) || testCase.steps.length === 0) && (
                <p className="text-sm text-slate-500">
                  No detailed steps defined yet. Edit this test case to add details.
                </p>
              )}
          </Card>
        </TabsContent>

        <TabsContent value="mappings">
          <Card>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-medium text-slate-700">
                Automation Scripts
              </h3>
              {permissions.canAuthorAutomation && (
                <Button size="sm" onClick={() => setMapScriptOpen(true)}>
                  <Plus className="mr-1 h-3 w-3" />
                  Map Script
                </Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Script Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(testCase.mappedScripts ?? []).map((mapping) => (
                  <TableRow key={mapping.mappingId}>
                    <TableCell>
                      <Link
                        to={`/tests/${mapping.canonicalTestId}`}
                        className="font-medium text-emerald-600 hover:underline"
                      >
                        {mapping.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={mapping.status} />
                    </TableCell>
                    <TableCell>
                      {permissions.canAuthorAutomation && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            removeMappingMutation.mutate(mapping.mappingId)
                          }
                          disabled={removeMappingMutation.isPending}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(testCase.mappedScripts ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-slate-500 py-8"
                    >
                      No scripts mapped yet. Map an automation script to link
                      execution results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {(testCase.externalLinks?.length ?? 0) > 0 && (
          <TabsContent value="external">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>External Case ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Synced</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(testCase.externalLinks ?? []).map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-mono text-sm">
                        {link.externalCaseId}
                      </TableCell>
                      <TableCell>{link.title ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={link.status} />
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {link.lastSyncedAt ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <MapScriptDialog
        open={mapScriptOpen}
        onOpenChange={setMapScriptOpen}
        suiteId={suiteId!}
        testCaseId={testCaseId!}
        existingMappingIds={
          testCase.mappedScripts?.map((m) => m.canonicalTestId) ?? []
        }
      />
    </div>
  );
}
