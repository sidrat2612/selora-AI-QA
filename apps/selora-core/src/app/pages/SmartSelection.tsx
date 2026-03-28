import { useState } from "react";
import { GitBranch, Zap, Target, Plus, Trash2, FileCode, Info } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { smartSelection, type SmartSelectionResult, type TestFileMapping } from "../../lib/api-client";
import { toast } from "sonner";

export function SmartSelection() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  // Analysis form state
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [baseSha, setBaseSha] = useState("");
  const [headSha, setHeadSha] = useState("");
  const [changedFiles, setChangedFiles] = useState("");
  const [analysisResult, setAnalysisResult] = useState<SmartSelectionResult | null>(null);

  // Mapping form state
  const [newTestId, setNewTestId] = useState("");
  const [newFilePattern, setNewFilePattern] = useState("");

  const mappingsQuery = useQuery({
    queryKey: ["smart-selection-mappings", activeWorkspaceId],
    queryFn: () => smartSelection.listMappings(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const analyseMutation = useMutation({
    mutationFn: () =>
      smartSelection.analyse(activeWorkspaceId!, {
        repoOwner,
        repoName,
        baseSha,
        headSha,
        changedFiles: changedFiles.split("\n").map((f) => f.trim()).filter(Boolean),
      }),
    onSuccess: (result) => {
      setAnalysisResult(result);
      toast.success(`Selected ${result.selectedCount} tests + ${result.randomSampleCount} random sample`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Analysis failed"),
  });

  const addMappingMutation = useMutation({
    mutationFn: () =>
      smartSelection.upsertMapping(activeWorkspaceId!, {
        testId: newTestId,
        filePattern: newFilePattern,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-selection-mappings"] });
      setNewTestId("");
      setNewFilePattern("");
      toast.success("Mapping added.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: string) => smartSelection.deleteMapping(activeWorkspaceId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-selection-mappings"] });
      toast.success("Mapping deleted.");
    },
  });

  const mappings = mappingsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Smart Test Selection</h1>
        <p className="mt-1 text-sm text-slate-500">
          Analyse git diffs to run only affected tests, reducing CI time by up to 80%
        </p>
      </div>

      <Tabs defaultValue="analyse" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analyse">
            <Zap className="mr-2 h-4 w-4" />
            Analyse Diff
          </TabsTrigger>
          <TabsTrigger value="mappings">
            <FileCode className="mr-2 h-4 w-4" />
            File Mappings ({mappings.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── Analyse ─────────────────────────────────────── */}
        <TabsContent value="analyse">
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-medium text-slate-700">Git Diff Analysis</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Repo Owner</Label>
                <Input placeholder="e.g. my-org" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} />
              </div>
              <div>
                <Label>Repo Name</Label>
                <Input placeholder="e.g. my-app" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
              </div>
              <div>
                <Label>Base SHA</Label>
                <Input placeholder="abc123..." value={baseSha} onChange={(e) => setBaseSha(e.target.value)} className="font-mono text-sm" />
              </div>
              <div>
                <Label>Head SHA</Label>
                <Input placeholder="def456..." value={headSha} onChange={(e) => setHeadSha(e.target.value)} className="font-mono text-sm" />
              </div>
            </div>
            <div>
              <Label>Changed Files (one per line)</Label>
              <Textarea
                placeholder={"src/components/Header.tsx\nsrc/pages/checkout.tsx\napi/routes/users.ts"}
                value={changedFiles}
                onChange={(e) => setChangedFiles(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
            </div>
            <Button
              onClick={() => analyseMutation.mutate()}
              disabled={!repoOwner || !repoName || !baseSha || !headSha || !changedFiles || analyseMutation.isPending}
            >
              <Target className="mr-2 h-4 w-4" />
              {analyseMutation.isPending ? "Analysing..." : "Analyse & Select Tests"}
            </Button>
          </Card>

          {/* Results */}
          {analysisResult && (
            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-medium text-slate-700">Selection Results</h3>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{analysisResult.totalTests}</div>
                  <p className="text-xs text-slate-500">Total Tests</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-600">{analysisResult.selectedCount}</div>
                  <p className="text-xs text-slate-500">Directly Affected</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{analysisResult.randomSampleCount}</div>
                  <p className="text-xs text-slate-500">Safety Sample</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{Math.round(analysisResult.coverageConfidence * 100)}%</div>
                  <p className="text-xs text-slate-500">Confidence</p>
                </div>
              </div>

              {analysisResult.mappedFiles.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-600 mb-2">Affected File Mappings</h4>
                  {analysisResult.mappedFiles.map((mf, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 text-sm">
                      <GitBranch className="h-3 w-3 text-slate-400" />
                      <code className="text-xs text-slate-600">{mf.file}</code>
                      <span className="text-slate-400">→</span>
                      <Badge variant="secondary" className="text-xs">{mf.testIds.length} test(s)</Badge>
                    </div>
                  ))}
                </div>
              )}

              {analysisResult.selectedCount === 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5" />
                  <p className="text-sm text-amber-700">
                    No file mappings matched the changed files. Add mappings in the "File Mappings" tab
                    or run with the full test suite to build mappings automatically.
                  </p>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ─── Mappings ────────────────────────────────────── */}
        <TabsContent value="mappings">
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-medium text-slate-700">Add File → Test Mapping</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-xs">Test ID</Label>
                <Input placeholder="canonical test ID" value={newTestId} onChange={(e) => setNewTestId(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="flex-1">
                <Label className="text-xs">File Pattern</Label>
                <Input placeholder="src/components/**/*.tsx" value={newFilePattern} onChange={(e) => setNewFilePattern(e.target.value)} className="font-mono text-sm" />
              </div>
              <Button
                size="sm"
                onClick={() => addMappingMutation.mutate()}
                disabled={!newTestId || !newFilePattern || addMappingMutation.isPending}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Pattern</TableHead>
                  <TableHead>Route Pattern</TableHead>
                  <TableHead>Test ID</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      No file mappings yet. Add mappings manually or run tests to learn them automatically.
                    </TableCell>
                  </TableRow>
                ) : (
                  mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.filePattern}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{m.routePattern ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.canonicalTestId.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge variant={m.confidence >= 0.8 ? "default" : "secondary"} className="text-xs">
                          {Math.round(m.confidence * 100)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{m.learnedFrom}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (window.confirm("Delete this mapping?")) deleteMappingMutation.mutate(m.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
