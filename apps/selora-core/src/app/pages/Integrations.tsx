import { useState } from "react";
import { Link } from "react-router";
import {
  Github, TestTube2, CheckCircle2, XCircle, Plus, Plug,
  RefreshCw, Search, Settings2, Trash2, ChevronRight,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import {
  integrations as integrationsApi,
  suites as suitesApi,
  githubIntegration as ghApi,
  testRailIntegration as trApi,
  license as licenseApi,
  type SuiteIntegrationSummary,
  type Suite,
} from "../../lib/api-client";
import { toast } from "sonner";

/* ─── Status Badge ──────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  if (status === "CONNECTED") {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
      <XCircle className="mr-1 h-3 w-3" /> {status === "DISCONNECTED" ? "Not Connected" : status}
    </Badge>
  );
}

/* ─── New Connector Wizard ──────────────────────────────────────────────────── */

type WizardStep = "select-type" | "select-suite" | "configure" | "test";

function NewConnectorWizard({
  open,
  onOpenChange,
  suites,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suites: Suite[];
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>("select-type");
  const [connectorType, setConnectorType] = useState<"github" | "testrail" | null>(null);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>("");
  const [testPassed, setTestPassed] = useState(false);

  // GitHub fields
  const [ghRepo, setGhRepo] = useState("");
  const [ghBranch, setGhBranch] = useState("main");
  const [ghWriteScope, setGhWriteScope] = useState("PULL_REQUESTS");
  const [ghToken, setGhToken] = useState("");

  // TestRail fields
  const [trBaseUrl, setTrBaseUrl] = useState("");
  const [trProjectId, setTrProjectId] = useState("");
  const [trSuiteIdExt, setTrSuiteIdExt] = useState("");
  const [trUsername, setTrUsername] = useState("");
  const [trApiKey, setTrApiKey] = useState("");

  const resetWizard = () => {
    setStep("select-type");
    setConnectorType(null);
    setSelectedSuiteId("");
    setTestPassed(false);
    setGhRepo(""); setGhBranch("main"); setGhWriteScope("PULL_REQUESTS"); setGhToken("");
    setTrBaseUrl(""); setTrProjectId(""); setTrSuiteIdExt(""); setTrUsername(""); setTrApiKey("");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (connectorType === "github") {
        const [owner, repo] = ghRepo.split("/");
        await ghApi.upsert(workspaceId, selectedSuiteId, {
          repoOwner: owner, repoName: repo, defaultBranch: ghBranch, allowedWriteScope: ghWriteScope,
        });
        if (ghToken) {
          await ghApi.rotateSecret(workspaceId, selectedSuiteId, { newToken: ghToken });
        }
      } else {
        await trApi.upsert(workspaceId, selectedSuiteId, {
          baseUrl: trBaseUrl, projectId: trProjectId, suiteIdExternal: trSuiteIdExt || undefined,
          username: trUsername, apiKey: trApiKey || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["suite"] });
      toast.success("Connector created successfully.");
      resetWizard();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create connector."),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      // Save first, then validate
      if (connectorType === "github") {
        const [owner, repo] = ghRepo.split("/");
        await ghApi.upsert(workspaceId, selectedSuiteId, {
          repoOwner: owner, repoName: repo, defaultBranch: ghBranch, allowedWriteScope: ghWriteScope,
        });
        if (ghToken) {
          await ghApi.rotateSecret(workspaceId, selectedSuiteId, { newToken: ghToken });
        }
        await ghApi.validate(workspaceId, selectedSuiteId);
      } else {
        await trApi.upsert(workspaceId, selectedSuiteId, {
          baseUrl: trBaseUrl, projectId: trProjectId, suiteIdExternal: trSuiteIdExt || undefined,
          username: trUsername, apiKey: trApiKey || undefined,
        });
        await trApi.validate(workspaceId, selectedSuiteId);
      }
    },
    onSuccess: () => {
      setTestPassed(true);
      toast.success("Connection test passed!");
    },
    onError: (e) => {
      setTestPassed(false);
      toast.error(e instanceof Error ? e.message : "Connection test failed.");
    },
  });

  const selectedSuiteName = suites.find((s) => s.id === selectedSuiteId)?.name;

  const canConfigure = connectorType === "github"
    ? ghRepo.includes("/") && ghBranch
    : trBaseUrl && trProjectId;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetWizard(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "select-type" && "New Connector"}
            {step === "select-suite" && `New ${connectorType === "github" ? "GitHub" : "TestRail"} Connector`}
            {step === "configure" && "Configure Connection"}
            {step === "test" && "Test Connection"}
          </DialogTitle>
          <DialogDescription>
            {step === "select-type" && "Select the type of integration to connect."}
            {step === "select-suite" && "Choose which suite this connector belongs to."}
            {step === "configure" && `Enter the ${connectorType === "github" ? "GitHub" : "TestRail"} connection details.`}
            {step === "test" && "Verify the connection works before saving."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select Type */}
        {step === "select-type" && (
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => { setConnectorType("github"); setStep("select-suite"); }}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-colors"
            >
              <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center">
                <Github className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium">GitHub</span>
              <span className="text-xs text-slate-500 text-center">Repository, webhooks & artifact publication</span>
            </button>
            <button
              onClick={() => { setConnectorType("testrail"); setStep("select-suite"); }}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition-colors"
            >
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <TestTube2 className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium">TestRail</span>
              <span className="text-xs text-slate-500 text-center">Sync test cases & results</span>
            </button>
          </div>
        )}

        {/* Step 2: Select Suite */}
        {step === "select-suite" && (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Suite</Label>
              <Select value={selectedSuiteId} onValueChange={setSelectedSuiteId}>
                <SelectTrigger><SelectValue placeholder="Select a suite…" /></SelectTrigger>
                <SelectContent>
                  {suites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">The connector will be linked to this suite.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep("select-type"); setConnectorType(null); }}>Back</Button>
              <Button onClick={() => setStep("configure")} disabled={!selectedSuiteId}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Configure */}
        {step === "configure" && connectorType === "github" && (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wiz-gh-repo">Repository</Label>
              <Input id="wiz-gh-repo" placeholder="owner/repository" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-gh-branch">Default Branch</Label>
              <Input id="wiz-gh-branch" placeholder="main" value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-gh-scope">Write Scope</Label>
              <Select value={ghWriteScope} onValueChange={setGhWriteScope}>
                <SelectTrigger id="wiz-gh-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="READ_ONLY">Read only</SelectItem>
                  <SelectItem value="BRANCH_PUSH">Branch push</SelectItem>
                  <SelectItem value="PULL_REQUESTS">Pull requests</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-gh-token">Personal Access Token</Label>
              <Input id="wiz-gh-token" type="password" placeholder="ghp_xxxxxxxxxxxx" value={ghToken} onChange={(e) => setGhToken(e.target.value)} />
              <p className="text-xs text-slate-500">Token needs repo, user, and admin:repo_hook scopes.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select-suite")}>Back</Button>
              <Button onClick={() => setStep("test")} disabled={!canConfigure}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {step === "configure" && connectorType === "testrail" && (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wiz-tr-url">TestRail URL</Label>
              <Input id="wiz-tr-url" placeholder="https://yourcompany.testrail.io" value={trBaseUrl} onChange={(e) => setTrBaseUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-tr-project">Project ID</Label>
              <Input id="wiz-tr-project" placeholder="e.g., P123" value={trProjectId} onChange={(e) => setTrProjectId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-tr-suite-ext">Suite ID (external, optional)</Label>
              <Input id="wiz-tr-suite-ext" placeholder="e.g., S456" value={trSuiteIdExt} onChange={(e) => setTrSuiteIdExt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-tr-user">Username</Label>
              <Input id="wiz-tr-user" placeholder="email@company.com" value={trUsername} onChange={(e) => setTrUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-tr-key">API Key</Label>
              <Input id="wiz-tr-key" type="password" placeholder="TestRail API key" value={trApiKey} onChange={(e) => setTrApiKey(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select-suite")}>Back</Button>
              <Button onClick={() => setStep("test")} disabled={!canConfigure}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Test & Save */}
        {step === "test" && (
          <div className="py-4 space-y-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${connectorType === "github" ? "bg-slate-900" : "bg-blue-600"}`}>
                  {connectorType === "github" ? <Github className="h-5 w-5 text-white" /> : <TestTube2 className="h-5 w-5 text-white" />}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {connectorType === "github" ? ghRepo : trBaseUrl}
                  </p>
                  <p className="text-xs text-slate-500">Suite: {selectedSuiteName}</p>
                </div>
              </div>
              {testPassed && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700 font-medium">Connection verified successfully</span>
                </div>
              )}
            </Card>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep("configure")}>Back</Button>
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${testMutation.isPending ? "animate-spin" : ""}`} />
                {testMutation.isPending ? "Testing…" : "Test Connection"}
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Finish"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Connector Row (expandable) ────────────────────────────────────────────── */

function ConnectorRow({
  item,
  type,
  workspaceId,
}: {
  item: SuiteIntegrationSummary;
  type: "github" | "testrail";
  workspaceId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const gh = item.github;
  const tr = item.testrail;
  const status = type === "github" ? gh!.status : tr!.status;

  const validateMutation = useMutation({
    mutationFn: () =>
      type === "github"
        ? ghApi.validate(workspaceId, item.suiteId)
        : trApi.validate(workspaceId, item.suiteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["suite"] });
      toast.success("Connection validated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Validation failed."),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      type === "github"
        ? ghApi.delete(workspaceId, item.suiteId)
        : trApi.delete(workspaceId, item.suiteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["suite"] });
      toast.success("Connector deleted.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed."),
  });

  return (
    <Card className="overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${type === "github" ? "bg-slate-900" : "bg-blue-600"}`}>
          {type === "github" ? <Github className="h-4 w-4 text-white" /> : <TestTube2 className="h-4 w-4 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {type === "github" ? `${gh!.repoOwner}/${gh!.repoName}` : tr!.baseUrl}
          </p>
          <p className="text-xs text-slate-500">
            Suite: {item.suiteName}
            {type === "github" && gh!.defaultBranch && <span className="ml-2">· Branch: {gh!.defaultBranch}</span>}
            {type === "testrail" && tr!.projectId && <span className="ml-2">· Project: {tr!.projectId}</span>}
          </p>
        </div>
        <StatusBadge status={status} />
        <ChevronRight className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t bg-slate-50 p-4 space-y-4">
          {type === "github" && gh && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400">Repository</span>
                <p className="font-medium">{gh.repoOwner}/{gh.repoName}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Branch</span>
                <p className="font-medium">{gh.defaultBranch}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Write Scope</span>
                <p className="font-medium">{gh.allowedWriteScope.replace(/_/g, " ")}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Credential Mode</span>
                <p className="font-medium">{gh.credentialMode.replace(/_/g, " ")}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Last Validated</span>
                <p className="font-medium">{gh.lastValidatedAt ? new Date(gh.lastValidatedAt).toLocaleString() : "Never"}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Secret Rotated</span>
                <p className="font-medium">{gh.secretRotatedAt ? new Date(gh.secretRotatedAt).toLocaleString() : "Never"}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Created</span>
                <p className="font-medium">{new Date(gh.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Updated</span>
                <p className="font-medium">{new Date(gh.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>
          )}

          {type === "testrail" && tr && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400">TestRail URL</span>
                <p className="font-medium truncate" title={tr.baseUrl}>{tr.baseUrl}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Project ID</span>
                <p className="font-medium">{tr.projectId}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">External Suite ID</span>
                <p className="font-medium">{tr.suiteIdExternal ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Sync Policy</span>
                <p className="font-medium">{tr.syncPolicy}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Last Validated</span>
                <p className="font-medium">{tr.lastValidatedAt ? new Date(tr.lastValidatedAt).toLocaleString() : "Never"}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Last Synced</span>
                <p className="font-medium">{tr.lastSyncedAt ? new Date(tr.lastSyncedAt).toLocaleString() : "Never"}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Created</span>
                <p className="font-medium">{new Date(tr.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Updated</span>
                <p className="font-medium">{new Date(tr.updatedAt).toLocaleDateString()}</p>
              </div>
              {tr.latestSync && (
                <div className="col-span-2 sm:col-span-4">
                  <span className="text-xs text-slate-400">Latest Sync</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={
                      tr.latestSync.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700" :
                      tr.latestSync.status === "FAILED" ? "bg-red-50 text-red-700" :
                      "bg-blue-50 text-blue-700"
                    }>{tr.latestSync.status}</Badge>
                    <span className="text-sm text-slate-600">
                      {tr.latestSync.syncedCount}/{tr.latestSync.totalCount} synced
                      {tr.latestSync.failedCount > 0 && `, ${tr.latestSync.failedCount} failed`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${validateMutation.isPending ? "animate-spin" : ""}`} />
              {validateMutation.isPending ? "Testing…" : "Test Connection"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/suites/${item.suiteId}`}>
                <Settings2 className="mr-2 h-3.5 w-3.5" />
                Edit in Suite
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
              onClick={() => { if (confirm("Delete this connector?")) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */

export function Integrations() {
  const { activeWorkspaceId } = useWorkspace();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const integrationsQuery = useQuery({
    queryKey: ["integrations", activeWorkspaceId],
    queryFn: () => integrationsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const suitesQuery = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const items = integrationsQuery.data ?? [];
  const suites = suitesQuery.data ?? [];

  // Build flat connector list
  const connectors: { item: SuiteIntegrationSummary; type: "github" | "testrail" }[] = [];
  for (const item of items) {
    if (item.github) connectors.push({ item, type: "github" });
    if (item.testrail) connectors.push({ item, type: "testrail" });
  }

  // Filter
  const filtered = connectors.filter((c) => {
    if (activeTab === "github" && c.type !== "github") return false;
    if (activeTab === "testrail" && c.type !== "testrail") return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = c.item.suiteName.toLowerCase().includes(q);
      const matchRepo = c.type === "github" && `${c.item.github!.repoOwner}/${c.item.github!.repoName}`.toLowerCase().includes(q);
      const matchUrl = c.type === "testrail" && c.item.testrail!.baseUrl.toLowerCase().includes(q);
      return matchName || matchRepo || matchUrl;
    }
    return true;
  });

  const githubCount = connectors.filter((c) => c.type === "github").length;
  const testrailCount = connectors.filter((c) => c.type === "testrail").length;
  const connectedCount = connectors.filter((c) =>
    c.type === "github" ? c.item.github!.status === "CONNECTED" : c.item.testrail!.status === "CONNECTED"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Connectors</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage GitHub and TestRail connections for your workspace
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Connector
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center">
            <Github className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">{githubCount}</p>
            <p className="text-xs text-slate-500">GitHub</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <TestTube2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">{testrailCount}</p>
            <p className="text-xs text-slate-500">TestRail</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">{connectedCount}</p>
            <p className="text-xs text-slate-500">Connected</p>
          </div>
        </Card>
      </div>

      {/* Tabs + Search */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="all">All ({connectors.length})</TabsTrigger>
            <TabsTrigger value="github">
              <Github className="mr-1 h-3.5 w-3.5" /> GitHub ({githubCount})
            </TabsTrigger>
            <TabsTrigger value="testrail">
              <TestTube2 className="mr-1 h-3.5 w-3.5" /> TestRail ({testrailCount})
            </TabsTrigger>
          </TabsList>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search connectors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {integrationsQuery.isLoading && (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}

          {!integrationsQuery.isLoading && filtered.length === 0 && (
            <Card className="p-12 text-center">
              <Plug className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">
                {connectors.length === 0 ? "No connectors yet" : "No matching connectors"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {connectors.length === 0
                  ? "Create a connector to link your workspace with GitHub or TestRail."
                  : "Try adjusting your search or filter."}
              </p>
              {connectors.length === 0 && (
                <Button className="mt-4" onClick={() => setWizardOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Connector
                </Button>
              )}
            </Card>
          )}

          <div className="space-y-3">
            {filtered.map((c) => (
              <ConnectorRow
                key={`${c.item.suiteId}-${c.type}`}
                item={c.item}
                type={c.type}
                workspaceId={activeWorkspaceId!}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Wizard */}
      <NewConnectorWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        suites={suites}
        workspaceId={activeWorkspaceId ?? ""}
      />
    </div>
  );
}
