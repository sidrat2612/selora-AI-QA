import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Play, Code, Globe, CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { apiTests, type ApiTestExecution } from "../../lib/api-client";
import { toast } from "sonner";

export function ApiTestDetail() {
  const { id } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");

  const { data: testData, isLoading } = useQuery({
    queryKey: ["api-test", activeWorkspaceId, id],
    queryFn: () => apiTests.get(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const { data: executionsData } = useQuery({
    queryKey: ["api-test-executions", activeWorkspaceId, id],
    queryFn: () => apiTests.listExecutions(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!selectedEnvId) throw new Error("Select an environment first.");
      return apiTests.execute(activeWorkspaceId!, id!, selectedEnvId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-test-executions"] });
      toast.success("Execution complete.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Execution failed."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiTests.delete(activeWorkspaceId!, id!),
    onSuccess: () => {
      toast.success("Deleted.");
      navigate("/api-tests");
    },
    onError: () => toast.error("Failed to delete."),
  });

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!testData) return <div className="p-8 text-center text-slate-500">Not found</div>;

  const executions = executionsData?.items ?? [];

  return (
    <div className="space-y-6">
      <Link to="/api-tests">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to API Tests
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            {testData.protocol === "GRAPHQL" ? (
              <Code className="h-5 w-5 text-purple-500" />
            ) : (
              <Globe className="h-5 w-5 text-blue-500" />
            )}
            <h1 className="text-2xl font-semibold text-slate-900">{testData.name}</h1>
            <Badge className={testData.status === "READY" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {testData.status}
            </Badge>
          </div>
          {testData.description && (
            <p className="mt-2 text-sm text-slate-600">{testData.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Delete "${testData.name}"?`)) deleteMutation.mutate();
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Request Summary */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-sm">{testData.method}</Badge>
          <code className="text-sm text-slate-700">{testData.urlTemplate}</code>
          <Badge variant="outline" className="ml-auto text-xs">{testData.protocol}</Badge>
        </div>
        {testData.suite && (
          <p className="mt-2 text-xs text-slate-500">Suite: {testData.suite.name}</p>
        )}
      </Card>

      {/* Quick Execute */}
      <Card className="p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Quick Execute</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Environment ID</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Enter environment ID..."
              value={selectedEnvId}
              onChange={(e) => setSelectedEnvId(e.target.value)}
            />
          </div>
          <Button
            onClick={() => executeMutation.mutate()}
            disabled={!selectedEnvId || executeMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            {executeMutation.isPending ? "Running..." : "Execute"}
          </Button>
        </div>
      </Card>

      {/* Tabs: Assertions, Execution History */}
      <Tabs defaultValue="assertions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assertions">Assertions ({(testData.assertionsJson ?? []).length})</TabsTrigger>
          <TabsTrigger value="history">Execution History ({executions.length})</TabsTrigger>
          {testData.protocol === "GRAPHQL" && <TabsTrigger value="query">GraphQL Query</TabsTrigger>}
          {testData.bodyTemplate && <TabsTrigger value="body">Request Body</TabsTrigger>}
        </TabsList>

        <TabsContent value="assertions">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>JSON Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(testData.assertionsJson ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-slate-500">
                      No assertions defined.
                    </TableCell>
                  </TableRow>
                ) : (
                  testData.assertionsJson.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{a.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{String(a.expected)}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{a.jsonPath ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP Status</TableHead>
                  <TableHead>Response Time</TableHead>
                  <TableHead>Assertions</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                      No executions yet. Run the test above.
                    </TableCell>
                  </TableRow>
                ) : (
                  executions.map((ex) => (
                    <ExecutionRow key={ex.id} execution={ex} />
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {testData.protocol === "GRAPHQL" && (
          <TabsContent value="query">
            <Card className="p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap text-slate-700">
                {testData.graphqlQuery ?? "No query defined"}
              </pre>
            </Card>
          </TabsContent>
        )}

        {testData.bodyTemplate && (
          <TabsContent value="body">
            <Card className="p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap text-slate-700">
                {testData.bodyTemplate}
              </pre>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ExecutionRow({ execution }: { execution: ApiTestExecution }) {
  const assertionResults = execution.assertionResultsJson ?? [];
  const passed = assertionResults.filter((r) => r.passed).length;
  const total = assertionResults.length;

  return (
    <TableRow>
      <TableCell>
        {execution.status === "PASSED" ? (
          <div className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">Passed</span>
          </div>
        ) : execution.status === "FAILED" ? (
          <div className="flex items-center gap-1 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Failed</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-600">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{execution.status}</span>
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-mono text-xs">
          {execution.responseStatus ?? "—"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-slate-600">
        {execution.responseTimeMs != null ? `${execution.responseTimeMs}ms` : "—"}
      </TableCell>
      <TableCell>
        {total > 0 ? (
          <span className={`text-sm ${passed === total ? "text-emerald-600" : "text-red-600"}`}>
            {passed}/{total} passed
          </span>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-slate-500">
        {new Date(execution.createdAt).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}
