import { useEffect, useState } from "react";
import { Save, Trash2, Zap, CheckCircle2, XCircle, Brain, Key, Globe, Server, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Switch } from "../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  llmConfig as llmConfigApi,
  type LlmProviderType,
  type LlmConfig,
  type LlmProviderPresets,
  type PlatformLlmConfig,
} from "../../../lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PROVIDER_META: Record<
  LlmProviderType,
  { label: string; description: string; icon: typeof Brain; requiresUrl: boolean; requiresKey: boolean }
> = {
  OPENAI: { label: "OpenAI", description: "GPT-4o, GPT-4.1, o3-mini and more", icon: Brain, requiresUrl: false, requiresKey: true },
  ANTHROPIC: { label: "Anthropic", description: "Claude Sonnet, Claude Haiku", icon: Brain, requiresUrl: false, requiresKey: true },
  GOOGLE_GEMINI: { label: "Google Gemini", description: "Gemini 2.5 Pro, Gemini 2.0 Flash", icon: Brain, requiresUrl: false, requiresKey: true },
  OLLAMA: { label: "Ollama (Local)", description: "Self-hosted models — Llama, Qwen, Mistral", icon: Server, requiresUrl: true, requiresKey: false },
  AZURE_OPENAI: { label: "Azure OpenAI", description: "Microsoft-hosted OpenAI models", icon: Globe, requiresUrl: true, requiresKey: true },
  CUSTOM: { label: "Bring Your Own", description: "Any OpenAI-compatible API endpoint", icon: Key, requiresUrl: true, requiresKey: true },
};

const ALL_PROVIDERS: LlmProviderType[] = ["OPENAI", "ANTHROPIC", "GOOGLE_GEMINI", "OLLAMA", "AZURE_OPENAI", "CUSTOM"];

type FormState = {
  provider: LlmProviderType;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  repairModelName: string;
  useRepairOverride: boolean;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  provider: "OPENAI",
  modelName: "",
  baseUrl: "",
  apiKey: "",
  repairModelName: "",
  useRepairOverride: false,
  isActive: true,
};

export function SettingsAI() {
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);

  const allConfigsQuery = useQuery({
    queryKey: ["platform-llm-configs"],
    queryFn: () => llmConfigApi.listAll(),
  });

  const presetsQuery = useQuery({
    queryKey: ["llm-provider-presets"],
    queryFn: () => llmConfigApi.getProviderPresets(),
  });

  const selectedConfigQuery = useQuery({
    queryKey: ["llm-config", selectedWorkspaceId],
    queryFn: () => llmConfigApi.get(selectedWorkspaceId!),
    enabled: !!selectedWorkspaceId && configureOpen,
  });

  const presets: LlmProviderPresets = presetsQuery.data ?? {};
  const allConfigs: PlatformLlmConfig[] = allConfigsQuery.data ?? [];

  useEffect(() => {
    if (!configureOpen) return;
    const config = selectedConfigQuery.data;
    if (!config) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      provider: config.provider,
      modelName: config.modelName,
      baseUrl: config.baseUrl ?? "",
      apiKey: "",
      repairModelName: config.repairModelName ?? "",
      useRepairOverride: !!config.repairModelName,
      isActive: config.isActive,
    });
  }, [selectedConfigQuery.data, configureOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.upsert(selectedWorkspaceId, {
        provider: form.provider,
        modelName: form.modelName,
        baseUrl: form.baseUrl || null,
        apiKey: form.apiKey || null,
        repairModelName: form.useRepairOverride && form.repairModelName ? form.repairModelName : null,
        isActive: form.isActive,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-llm-configs"] });
      await queryClient.invalidateQueries({ queryKey: ["llm-config", selectedWorkspaceId] });
      toast.success("AI model configuration saved.");
      setForm((prev) => ({ ...prev, apiKey: "" }));
      setConfigureOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save AI configuration.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.delete(selectedWorkspaceId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-llm-configs"] });
      setDeleteOpen(false);
      setSelectedWorkspaceId(null);
      toast.success("AI configuration removed.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete AI configuration.");
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.testConnection(selectedWorkspaceId, {
        provider: form.provider,
        modelName: form.modelName,
        baseUrl: form.baseUrl || null,
        apiKey: form.apiKey || null,
      });
    },
    onSuccess: (result) => {
      setTestResult(result);
      if (result.success) toast.success("Connection successful!");
      else toast.error(result.error ?? "Connection test failed.");
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "Connection test failed.";
      setTestResult({ success: false, error: msg });
      toast.error(msg);
    },
  });

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleProviderChange = (provider: LlmProviderType) => {
    const preset = presets[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      modelName: preset?.models[0] ?? "",
      baseUrl: PROVIDER_META[provider].requiresUrl ? (preset?.baseUrl ?? "") : "",
      apiKey: "",
    }));
    setTestResult(null);
  };

  const openConfigure = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setConfigureOpen(true);
    setTestResult(null);
  };

  const openDelete = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setDeleteOpen(true);
  };

  const providerModels = presets[form.provider]?.models ?? [];
  const meta = PROVIDER_META[form.provider];
  const hasExistingConfig = !!selectedConfigQuery.data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI / LLM Management</h1>
        <p className="mt-1 text-sm text-slate-600">
          View and manage AI model configurations across all workspaces
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-medium text-slate-500">Total Configs</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{allConfigs.length}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-slate-500">Active</div>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {allConfigs.filter((c) => c.isActive).length}
          </p>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-slate-500">Providers in Use</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {new Set(allConfigs.map((c) => c.provider)).size}
          </p>
        </Card>
      </div>

      {/* Workspace Configs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace LLM Configurations</CardTitle>
          <CardDescription>
            Each workspace can have its own AI provider and model configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allConfigs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No workspaces have configured an AI model yet.
            </p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Repair Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allConfigs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{config.workspaceName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{PROVIDER_META[config.provider]?.label ?? config.provider}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{config.modelName}</TableCell>
                      <TableCell className="font-mono text-xs">{config.repairModelName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={config.isActive ? "default" : "secondary"}>
                          {config.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(config.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openConfigure(config.workspaceId)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => openDelete(config.workspaceId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configure Dialog */}
      <Dialog open={configureOpen} onOpenChange={setConfigureOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure AI Model</DialogTitle>
            <DialogDescription>
              Set the AI provider and model for workspace{" "}
              <span className="font-medium text-slate-700">
                {allConfigs.find((c) => c.workspaceId === selectedWorkspaceId)?.workspaceName ?? selectedWorkspaceId}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Provider Selection */}
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {ALL_PROVIDERS.map((provider) => {
                  const info = PROVIDER_META[provider];
                  const Icon = info.icon;
                  const isSelected = form.provider === provider;
                  return (
                    <button
                      key={provider}
                      type="button"
                      className={`flex flex-col items-start rounded-lg border-2 p-3 text-left transition-colors ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      } cursor-pointer`}
                      onClick={() => handleProviderChange(provider)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${isSelected ? "text-indigo-600" : "text-slate-500"}`} />
                        <span className={`text-sm font-medium ${isSelected ? "text-indigo-900" : "text-slate-900"}`}>
                          {info.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{info.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label>Model</Label>
              {providerModels.length > 0 ? (
                <div className="flex gap-2">
                  <Select
                    value={providerModels.includes(form.modelName) ? form.modelName : "__custom__"}
                    onValueChange={(v) => { if (v !== "__custom__") updateField("modelName", v); }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {providerModels.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom model name...</SelectItem>
                    </SelectContent>
                  </Select>
                  {!providerModels.includes(form.modelName) && (
                    <Input
                      placeholder="e.g. my-fine-tuned-model"
                      value={form.modelName}
                      onChange={(e) => updateField("modelName", e.target.value)}
                      className="flex-1"
                    />
                  )}
                </div>
              ) : (
                <Input
                  placeholder="Enter model name"
                  value={form.modelName}
                  onChange={(e) => updateField("modelName", e.target.value)}
                />
              )}
            </div>

            {/* Base URL */}
            {meta.requiresUrl && (
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  placeholder={
                    form.provider === "OLLAMA"
                      ? "http://localhost:11434/v1"
                      : "https://your-api.example.com/v1"
                  }
                  value={form.baseUrl}
                  onChange={(e) => updateField("baseUrl", e.target.value)}
                />
              </div>
            )}

            {/* API Key */}
            <div className="space-y-2">
              <Label>
                API Key
                {!meta.requiresKey && <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>}
              </Label>
              <Input
                type="password"
                placeholder={
                  hasExistingConfig && selectedConfigQuery.data?.hasApiKey
                    ? `Current: ${selectedConfigQuery.data.maskedApiKey ?? "••••••••"} — leave blank to keep`
                    : "Enter API key"
                }
                value={form.apiKey}
                onChange={(e) => updateField("apiKey", e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !form.modelName}
              >
                <Zap className="mr-2 h-4 w-4" />
                {testMutation.isPending ? "Testing..." : "Test Connection"}
              </Button>
              {testResult && (
                <div className="flex items-center gap-1.5">
                  {testResult.success ? (
                    <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm text-emerald-700">Connected</span></>
                  ) : (
                    <><XCircle className="h-4 w-4 text-red-600" /><span className="text-sm text-red-700">{testResult.error ?? "Failed"}</span></>
                  )}
                </div>
              )}
            </div>

            {/* Repair Model Override */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div className="space-y-0.5">
                <Label>Different model for AI Repair</Label>
                <p className="text-xs text-slate-500">Use a cheaper / faster model for automatic test repair</p>
              </div>
              <Switch
                checked={form.useRepairOverride}
                onCheckedChange={(checked) => updateField("useRepairOverride", checked)}
              />
            </div>

            {form.useRepairOverride && (
              <div className="space-y-2 pl-4">
                <Label>Repair Model</Label>
                {providerModels.length > 0 ? (
                  <Select
                    value={providerModels.includes(form.repairModelName) ? form.repairModelName : ""}
                    onValueChange={(v) => updateField("repairModelName", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select repair model" /></SelectTrigger>
                    <SelectContent>
                      {providerModels.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Enter repair model name"
                    value={form.repairModelName}
                    onChange={(e) => updateField("repairModelName", e.target.value)}
                  />
                )}
              </div>
            )}

            {/* Active Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div className="space-y-0.5">
                <Label>Enable AI Features</Label>
                <p className="text-xs text-slate-500">When disabled, AI falls back to environment-level defaults</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => updateField("isActive", checked)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigureOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.modelName}>
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove AI Configuration</DialogTitle>
            <DialogDescription>
              This will delete the stored provider, model, and API key for this workspace. AI features
              will fall back to environment-level defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing..." : "Remove Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
