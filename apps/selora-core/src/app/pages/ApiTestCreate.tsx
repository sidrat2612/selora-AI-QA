import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { apiTests, type ApiAssertion } from "../../lib/api-client";
import { toast } from "sonner";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export function ApiTestCreate() {
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [protocol, setProtocol] = useState<"REST" | "GRAPHQL">("REST");
  const [method, setMethod] = useState("GET");
  const [urlTemplate, setUrlTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [graphqlQuery, setGraphqlQuery] = useState("");
  const [assertions, setAssertions] = useState<ApiAssertion[]>([
    { type: "status_code", expected: 200 },
  ]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiTests.create(activeWorkspaceId!, {
        name,
        description: description || undefined,
        protocol,
        method,
        urlTemplate,
        bodyTemplate: bodyTemplate || undefined,
        graphqlQuery: graphqlQuery || undefined,
        assertions,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-tests"] });
      toast.success("API test created.");
      navigate(`/api-tests/${data.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create.");
    },
  });

  const addAssertion = () => {
    setAssertions([...assertions, { type: "status_code", expected: 200 }]);
  };

  const removeAssertion = (idx: number) => {
    setAssertions(assertions.filter((_, i) => i !== idx));
  };

  const updateAssertion = (idx: number, field: keyof ApiAssertion, value: string | number) => {
    const copy = [...assertions];
    copy[idx] = { ...copy[idx]!, [field]: value };
    setAssertions(copy);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/api-tests")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to API Tests
      </Button>

      <h1 className="text-2xl font-semibold text-foreground">Create API Test</h1>

      {/* Basic Info */}
      <Card className="p-6 space-y-4">
        <div>
          <Label>Name</Label>
          <Input placeholder="e.g. Get Users List" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea placeholder="Optional description..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
      </Card>

      {/* Protocol & Method */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Request Configuration</h3>
        <div className="flex gap-4">
          <div className="w-40">
            <Label>Protocol</Label>
            <select
              className="w-full mt-1 rounded-md border border-border bg-white px-3 py-2 text-sm"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as "REST" | "GRAPHQL")}
            >
              <option value="REST">REST</option>
              <option value="GRAPHQL">GraphQL</option>
            </select>
          </div>
          {protocol === "REST" && (
            <div className="w-32">
              <Label>Method</Label>
              <select
                className="w-full mt-1 rounded-md border border-border bg-white px-3 py-2 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1">
            <Label>URL</Label>
            <Input
              placeholder={protocol === "GRAPHQL" ? "/graphql" : "/api/v1/users"}
              value={urlTemplate}
              onChange={(e) => setUrlTemplate(e.target.value)}
            />
          </div>
        </div>

        {protocol === "REST" ? (
          <div>
            <Label>Request Body (JSON)</Label>
            <Textarea
              placeholder='{"key": "value"}'
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        ) : (
          <div>
            <Label>GraphQL Query</Label>
            <Textarea
              placeholder={"query {\n  users {\n    id\n    name\n  }\n}"}
              value={graphqlQuery}
              onChange={(e) => setGraphqlQuery(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>
        )}
      </Card>

      {/* Assertions */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Assertions</h3>
          <Button variant="outline" size="sm" onClick={addAssertion}>
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>

        {assertions.map((a, idx) => (
          <div key={idx} className="flex items-end gap-3 rounded-lg border border-border p-3">
            <div className="w-44">
              <Label className="text-xs">Type</Label>
              <select
                className="w-full mt-1 rounded-md border border-border bg-white px-2 py-1.5 text-sm"
                value={a.type}
                onChange={(e) => updateAssertion(idx, "type", e.target.value)}
              >
                <option value="status_code">Status Code</option>
                <option value="response_time">Response Time (ms)</option>
                <option value="body_contains">Body Contains</option>
                <option value="body_json_path">JSON Path</option>
                <option value="header_present">Header Present</option>
              </select>
            </div>
            {a.type === "body_json_path" && (
              <div className="w-40">
                <Label className="text-xs">JSON Path</Label>
                <Input
                  placeholder="data.items[0].id"
                  value={a.jsonPath ?? ""}
                  onChange={(e) => updateAssertion(idx, "jsonPath", e.target.value)}
                  className="text-sm"
                />
              </div>
            )}
            <div className="flex-1">
              <Label className="text-xs">Expected</Label>
              <Input
                placeholder="200"
                value={String(a.expected)}
                onChange={(e) => updateAssertion(idx, "expected", e.target.value)}
                className="text-sm"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeAssertion(idx)} className="text-red-500 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </Card>

      {/* Submit */}
      <div className="flex gap-3">
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!name || !urlTemplate || createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "Create API Test"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/api-tests")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
