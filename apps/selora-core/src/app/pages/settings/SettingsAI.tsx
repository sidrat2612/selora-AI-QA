import { useEffect, useState } from "react";
import { Save, Zap, CheckCircle2, XCircle, Brain, Key, Globe, Server, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { usePermissions } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import {
  llmConfig as llmConfigApi,
  type LlmProviderType,
  type LlmProviderPresets,
} from "../../../lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PROVIDER_LABEL: Record<LlmProviderType, { label: string; icon: typeof Brain }> = {
  OPENAI: { label: "OpenAI", icon: Brain },
  ANTHROPIC: { label: "Anthropic", icon: Brain },
  GOOGLE_GEMINI: { label: "Google Gemini", icon: Brain },
  OLLAMA: { label: "Ollama (Local)", icon: Server },
  AZURE_OPENAI: { label: "Azure OpenAI", icon: Globe },
  CUSTOM: { label: "Bring Your Own", icon: Key },
};

type BYOForm = {
  modelName: string;
  baseUrl: string;
  apiKey: string;
};

const EMPTY_BYO: BYOForm = { modelName: "", baseUrl: "", apiKey: "" };

export function SettingsAI() {
  const permissions = usePermissions();
  const canEdit = permissions.canManageCompany || permissions.canManageIntegrations;
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [byoForm, setByoForm] = useState<BYOForm>(EMPTY_BYO);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);

  const configQuery = useQuery({
    queryKey: ["llm-config", activeWorkspaceId],
    queryFn: () => llmConfigApi.get(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const presetsQuery = useQuery({
    queryKey: ["llm-provider-presets"],
    queryFn: () => llmConfigApi.getProviderPresets(),
  });

  const presets: LlmProviderPresets = presetsQuery.data ?? {};
  const currentConfig = configQuery.data;

  // Build flat list of all available provider models
  const allModels = Object.entries(presets).flatMap(([provider, preset]) =>
    preset.models.map((model) => ({
      provider: provider as LlmProviderType,
      model,
      providerLabel: PROVIDER_LABEL[provider as LlmProviderType]?.label ?? provider,
      Icon: PROVIDER_LABEL[provider as LlmProviderType]?.icon ?? Brain,
    })),
  );

  const saveBYOMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.upsert(activeWorkspaceId, {
        provider: "CUSTOM",
        modelName: byoForm.modelName,
        baseUrl: byoForm.baseUrl || null,
        apiKey: byoForm.apiKey || null,
        isActive: true,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["llm-config", activeWorkspaceId] });
      toast.success("Custom model connected.");
      setByoForm(EMPTY_BYO);
      setTestResult(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save custom model.");
    },
  });

  const selectModelMutation = useMutation({
    mutationFn: async ({ provider, model }: { provider: LlmProviderType; model: string }) => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.upsert(activeWorkspaceId, {
        provider,
        modelName: model,
        isActive: true,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["llm-config", activeWorkspaceId] });
      toast.success("AI model updated.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update model.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.delete(activeWorkspaceId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["llm-config", activeWorkspaceId] });
      setDeleteOpen(false);
      toast.success("AI configuration removed.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove configuration.");
    },
  });

  const testBYOMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return llmConfigApi.testConnection(activeWorkspaceId, {
        provider: "CUSTOM",
        modelName: byoForm.modelName,
        baseUrl: byoForm.baseUrl || null,
        apiKey: byoForm.apiKey || null,
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">AI / LLM Configuration</h1>
          <p className="mt-1 text-sm text-slate-600">
            View connected models and connect your own AI provider for this workspace
          </p>
        </div>
        {currentConfig && canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove Config
          </Button>
        )}
      </div>

      {/* Current Configuration */}
      {currentConfig && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Active Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Provider</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {PROVIDER_LABEL[currentConfig.provider]?.label ?? currentConfig.provider}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Model</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900 font-mono">{currentConfig.modelName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">API Key</p>
                <p className="mt-0.5 text-sm text-slate-900">
                  {currentConfig.hasApiKey ? (
                    <span className="font-mono text-xs">{currentConfig.maskedApiKey}</span>
                  ) : (
                    <span className="text-slate-400">Not set</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Status</p>
                <Badge variant={currentConfig.isActive ? "default" : "secondary"} className="mt-0.5">
                  {currentConfig.isActive ? "Active" : "Disabled"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Models */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-indigo-600" />
            Available Models
          </CardTitle>
          <CardDescription>
            Pre-configured models available for this workspace. Select one to activate it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allModels.map(({ provider, model, providerLabel, Icon }) => {
              const isActive = currentConfig?.provider === provider && currentConfig?.modelName === model;
              return (
                <div
                  key={`${provider}-${model}`}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    isActive ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 font-mono truncate">{model}</p>
                      <p className="text-xs text-slate-500">{providerLabel}</p>
                    </div>
                  </div>
                  {isActive ? (
                    <Badge variant="default" className="shrink-0 ml-2">Active</Badge>
                  ) : canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 ml-2"
                      disabled={selectModelMutation.isPending}
                      onClick={() => selectModelMutation.mutate({ provider, model })}
                    >
                      Select
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {allModels.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Loading available models...</p>
          )}
        </CardContent>
      </Card>

      {/* Bring Your Own Model */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-5 w-5 text-amber-600" />
              Bring Your Own Model
            </CardTitle>
            <CardDescription>
              Connect any OpenAI-compatible AI endpoint. Provide the base URL, model name, and API key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="byo-model">Model Name</Label>
                <Input
                  id="byo-model"
                  placeholder="e.g. my-fine-tuned-gpt4"
                  value={byoForm.modelName}
                  onChange={(e) => { setByoForm((f) => ({ ...f, modelName: e.target.value })); setTestResult(null); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="byo-url">Base URL</Label>
                <Input
                  id="byo-url"
                  placeholder="https://your-api.example.com/v1"
                  value={byoForm.baseUrl}
                  onChange={(e) => { setByoForm((f) => ({ ...f, baseUrl: e.target.value })); setTestResult(null); }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="byo-key">API Key</Label>
              <Input
                id="byo-key"
                type="password"
                placeholder="Enter API key"
                value={byoForm.apiKey}
                onChange={(e) => { setByoForm((f) => ({ ...f, apiKey: e.target.value })); setTestResult(null); }}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testBYOMutation.mutate()}
                disabled={testBYOMutation.isPending || !byoForm.modelName || !byoForm.baseUrl}
              >
                <Zap className="mr-2 h-4 w-4" />
                {testBYOMutation.isPending ? "Testing..." : "Test Connection"}
              </Button>
              <Button
                size="sm"
                onClick={() => saveBYOMutation.mutate()}
                disabled={saveBYOMutation.isPending || !byoForm.modelName || !byoForm.baseUrl}
              >
                <Save className="mr-2 h-4 w-4" />
                {saveBYOMutation.isPending ? "Connecting..." : "Connect Model"}
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
          </CardContent>
        </Card>
      )}

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
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
