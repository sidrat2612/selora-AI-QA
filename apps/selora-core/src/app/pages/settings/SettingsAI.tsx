import { useState } from "react";
import {
  CheckCircle2, Brain, Key, Globe, Server, Trash2, Zap, XCircle, Plus,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import { Switch } from "../../components/ui/switch";
import { usePermissions } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import {
  llmConfig as llmConfigApi,
  type LlmProviderType,
  type LlmProviderPresets,
  type AvailableLlmConfig,
} from "../../../lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PROVIDER_LABEL: Record<LlmProviderType, { label: string; icon: typeof Brain }> = {
  OPENAI: { label: "OpenAI", icon: Brain },
  ANTHROPIC: { label: "Anthropic", icon: Brain },
  GOOGLE_GEMINI: { label: "Google Gemini", icon: Brain },
  OLLAMA: { label: "Ollama (Local)", icon: Server },
  AZURE_OPENAI: { label: "Azure OpenAI", icon: Globe },
  CUSTOM: { label: "Custom", icon: Key },
};

const PROVIDER_META: Record<
  LlmProviderType,
  { label: string; description: string; icon: typeof Brain; requiresUrl: boolean; requiresKey: boolean }
> = {
  OPENAI: { label: "OpenAI", description: "GPT-4o, GPT-4.1, o3-mini", icon: Brain, requiresUrl: false, requiresKey: true },
  ANTHROPIC: { label: "Anthropic", description: "Claude Sonnet, Haiku", icon: Brain, requiresUrl: false, requiresKey: true },
  GOOGLE_GEMINI: { label: "Google Gemini", description: "Gemini 2.5 Pro, Flash", icon: Brain, requiresUrl: false, requiresKey: true },
  OLLAMA: { label: "Ollama (Local)", description: "Llama, Qwen, Mistral", icon: Server, requiresUrl: true, requiresKey: false },
  AZURE_OPENAI: { label: "Azure OpenAI", description: "Microsoft-hosted models", icon: Globe, requiresUrl: true, requiresKey: true },
  CUSTOM: { label: "Bring Your Own", description: "Any OpenAI-compatible API", icon: Key, requiresUrl: true, requiresKey: true },
};

const ALL_PROVIDERS: LlmProviderType[] = ["OPENAI", "ANTHROPIC", "GOOGLE_GEMINI", "OLLAMA", "AZURE_OPENAI", "CUSTOM"];

type BYOFormState = {
  displayName: string;
  provider: LlmProviderType;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  repairModelName: string;
  useRepairOverride: boolean;
};

const EMPTY_BYO_FORM: BYOFormState = {
  displayName: "",
  provider: "OPENAI",
  modelName: "",
  baseUrl: "",
  apiKey: "",
  repairModelName: "",
  useRepairOverride: false,
};

export function SettingsAI() {
  const permissions = usePermissions();
  const canEdit = permissions.canManageCompany || permissions.canManageIntegrations;
  const { activeTenantId } = useWorkspace();
  const queryClient = useQueryClient();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [byoOpen, setByoOpen] = useState(false);
  const [byoForm, setByoForm] = useState<BYOFormState>(EMPTY_BYO_FORM);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);

  const availableQuery = useQuery({
    queryKey: ["llm-configs-available"],
    queryFn: () => llmConfigApi.listAvailable(),
  });

  const selectionQuery = useQuery({
    queryKey: ["tenant-llm-selection", activeTenantId],
    queryFn: () => llmConfigApi.getTenantSelection(activeTenantId!),
    enabled: !!activeTenantId,
  });

  const presetsQuery = useQuery({
    queryKey: ["llm-provider-presets"],
    queryFn: () => llmConfigApi.getProviderPresets(),
  });

  const availableConfigs: AvailableLlmConfig[] = availableQuery.data ?? [];
  const currentSelection = selectionQuery.data;
  const presets: LlmProviderPresets = presetsQuery.data ?? {};

  const selectMutation = useMutation({
    mutationFn: async (configId: string) => {
      if (!activeTenantId) throw new Error("No tenant selected.");
      return llmConfigApi.selectForTenant(activeTenantId, configId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-llm-selection", activeTenantId] });
      toast.success("AI model updated.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update model selection.");
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("No tenant selected.");
      return llmConfigApi.clearTenantSelection(activeTenantId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-llm-selection", activeTenantId] });
      setRemoveOpen(false);
      toast.success("AI configuration removed.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove selection.");
    },
  });

  const saveBYOMutation = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("No tenant selected.");
      return llmConfigApi.saveCustomConfig(activeTenantId, {
        provider: byoForm.provider,
        modelName: byoForm.modelName,
        displayName: byoForm.displayName || undefined,
        baseUrl: byoForm.baseUrl || undefined,
        apiKey: byoForm.apiKey || undefined,
        repairModelName: byoForm.useRepairOverride && byoForm.repairModelName ? byoForm.repairModelName : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-llm-selection", activeTenantId] });
      toast.success("Custom model saved.");
      setByoOpen(false);
      setByoForm(EMPTY_BYO_FORM);
      setTestResult(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save custom model.");
    },
  });

  const testBYOMutation = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("No tenant selected.");
      return llmConfigApi.testCustomConnection(activeTenantId, {
        provider: byoForm.provider,
        modelName: byoForm.modelName,
        baseUrl: byoForm.baseUrl || undefined,
        apiKey: byoForm.apiKey || undefined,
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

  const updateBYOField = <K extends keyof BYOFormState>(key: K, value: BYOFormState[K]) => {
    setByoForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleBYOProviderChange = (provider: LlmProviderType) => {
    const preset = presets[provider];
    setByoForm((prev) => ({
      ...prev,
      provider,
      modelName: preset?.models[0] ?? "",
      baseUrl: PROVIDER_META[provider].requiresUrl ? (preset?.baseUrl ?? "") : "",
      apiKey: "",
    }));
    setTestResult(null);
  };

  const openBYO = () => {
    // Pre-fill from existing custom config if editing
    if (currentSelection?.isCustom) {
      setByoForm({
        displayName: currentSelection.config.displayName ?? "",
        provider: currentSelection.config.provider,
        modelName: currentSelection.config.modelName,
        baseUrl: currentSelection.config.baseUrl ?? "",
        apiKey: "",
        repairModelName: currentSelection.config.repairModelName ?? "",
        useRepairOverride: !!currentSelection.config.repairModelName,
      });
    } else {
      setByoForm(EMPTY_BYO_FORM);
    }
    setTestResult(null);
    setByoOpen(true);
  };

  const providerModels = presets[byoForm.provider]?.models ?? [];
  const meta = PROVIDER_META[byoForm.provider];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AI / LLM Configuration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a platform AI provider or bring your own model
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={openBYO}>
              <Plus className="mr-2 h-4 w-4" />
              Bring Your Own Model
            </Button>
          )}
          {currentSelection && canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove Selection
            </Button>
          )}
        </div>
      </div>

      {/* Current Selection */}
      {currentSelection && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Active Model
              {currentSelection.isCustom && (
                <Badge variant="outline" className="ml-2 text-xs">Custom</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Name</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{currentSelection.config.displayName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Provider</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {PROVIDER_LABEL[currentSelection.config.provider]?.label ?? currentSelection.config.provider}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Model</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground font-mono">{currentSelection.config.modelName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Status</p>
                <Badge variant={currentSelection.config.isActive ? "default" : "secondary"} className="mt-0.5">
                  {currentSelection.config.isActive ? "Active" : "Disabled"}
                </Badge>
              </div>
            </div>
            {currentSelection.isCustom && canEdit && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <Button variant="outline" size="sm" onClick={openBYO}>
                  Edit Custom Configuration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Platform Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-indigo-600" />
            Available AI Providers
          </CardTitle>
          <CardDescription>
            Platform-managed AI providers. Select one to use for your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableConfigs.map((config) => {
              const isSelected = !currentSelection?.isCustom && currentSelection?.platformLlmConfigId === config.id;
              const providerInfo = PROVIDER_LABEL[config.provider] ?? { label: config.provider, icon: Brain };
              const Icon = providerInfo.icon;
              return (
                <div
                  key={config.id}
                  className={`flex flex-col rounded-lg border p-4 ${
                    isSelected ? "border-emerald-300 bg-emerald-50/50" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className={`h-5 w-5 shrink-0 ${isSelected ? "text-emerald-600" : "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{config.displayName}</p>
                      <p className="text-xs text-muted-foreground">{providerInfo.label}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mb-3">{config.modelName}</p>
                  <div className="mt-auto">
                    {isSelected ? (
                      <Badge variant="default">Selected</Badge>
                    ) : canEdit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectMutation.isPending}
                        onClick={() => selectMutation.mutate(config.id)}
                      >
                        Select
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {availableConfigs.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No AI providers have been configured by the platform administrator yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* BYO Custom Config Dialog */}
      <Dialog open={byoOpen} onOpenChange={setByoOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {currentSelection?.isCustom ? "Edit Custom Model" : "Bring Your Own Model"}
            </DialogTitle>
            <DialogDescription>
              Configure your own AI provider with your API key. This will override any platform provider selection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Display Name */}
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                placeholder="e.g. My OpenAI GPT-4o"
                value={byoForm.displayName}
                onChange={(e) => updateBYOField("displayName", e.target.value)}
              />
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {ALL_PROVIDERS.map((provider) => {
                  const info = PROVIDER_META[provider];
                  const Icon = info.icon;
                  const isSelected = byoForm.provider === provider;
                  return (
                    <button
                      key={provider}
                      type="button"
                      className={`flex flex-col items-start rounded-lg border-2 p-3 text-left transition-colors ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/50"
                          : "border-border hover:border-border hover:bg-muted/50"
                      } cursor-pointer`}
                      onClick={() => handleBYOProviderChange(provider)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${isSelected ? "text-indigo-600" : "text-muted-foreground"}`} />
                        <span className={`text-sm font-medium ${isSelected ? "text-indigo-900" : "text-foreground"}`}>
                          {info.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
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
                    value={providerModels.includes(byoForm.modelName) ? byoForm.modelName : "__custom__"}
                    onValueChange={(v) => { if (v !== "__custom__") updateBYOField("modelName", v); }}
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
                  {!providerModels.includes(byoForm.modelName) && (
                    <Input
                      placeholder="e.g. my-fine-tuned-model"
                      value={byoForm.modelName}
                      onChange={(e) => updateBYOField("modelName", e.target.value)}
                      className="flex-1"
                    />
                  )}
                </div>
              ) : (
                <Input
                  placeholder="Enter model name"
                  value={byoForm.modelName}
                  onChange={(e) => updateBYOField("modelName", e.target.value)}
                />
              )}
            </div>

            {/* Base URL */}
            {meta.requiresUrl && (
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  placeholder={
                    byoForm.provider === "OLLAMA"
                      ? "http://localhost:11434/v1"
                      : "https://your-api.example.com/v1"
                  }
                  value={byoForm.baseUrl}
                  onChange={(e) => updateBYOField("baseUrl", e.target.value)}
                />
              </div>
            )}

            {/* API Key */}
            <div className="space-y-2">
              <Label>
                API Key
                {!meta.requiresKey && <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>}
              </Label>
              <Input
                type="password"
                placeholder={
                  currentSelection?.isCustom
                    ? "Leave blank to keep existing key"
                    : "Enter API key"
                }
                value={byoForm.apiKey}
                onChange={(e) => updateBYOField("apiKey", e.target.value)}
                autoComplete="off"
              />
              {currentSelection?.isCustom && currentSelection.config.maskedApiKey && (
                <p className="text-xs text-muted-foreground">
                  Current key: {currentSelection.config.maskedApiKey}
                </p>
              )}
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testBYOMutation.mutate()}
                disabled={testBYOMutation.isPending || !byoForm.modelName}
              >
                <Zap className="mr-2 h-4 w-4" />
                {testBYOMutation.isPending ? "Testing..." : "Test Connection"}
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
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label>Different model for AI Repair</Label>
                <p className="text-xs text-muted-foreground">Use a cheaper / faster model for automatic test repair</p>
              </div>
              <Switch
                checked={byoForm.useRepairOverride}
                onCheckedChange={(checked) => updateBYOField("useRepairOverride", checked)}
              />
            </div>

            {byoForm.useRepairOverride && (
              <div className="space-y-2 pl-4">
                <Label>Repair Model</Label>
                {providerModels.length > 0 ? (
                  <Select
                    value={providerModels.includes(byoForm.repairModelName) ? byoForm.repairModelName : ""}
                    onValueChange={(v) => updateBYOField("repairModelName", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select repair model" /></SelectTrigger>
                    <SelectContent>
                      {providerModels.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Enter repair model name"
                    value={byoForm.repairModelName}
                    onChange={(e) => updateBYOField("repairModelName", e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setByoOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveBYOMutation.mutate()}
              disabled={saveBYOMutation.isPending || !byoForm.modelName || !byoForm.provider}
            >
              {saveBYOMutation.isPending ? "Saving..." : "Save Custom Model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove AI Selection</DialogTitle>
            <DialogDescription>
              This will clear your organization's AI provider selection. AI features
              will be unavailable until a new provider is selected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              {clearMutation.isPending ? "Removing..." : "Remove Selection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
