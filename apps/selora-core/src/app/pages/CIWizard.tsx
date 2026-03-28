import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import {
  integrations as integrationsApi,
  workspaces as workspacesApi,
} from "../../lib/api-client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Input } from "../components/ui/input";
import {
  GitBranch,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Terminal,
} from "lucide-react";

const CI_PLATFORMS = [
  { value: "github_actions", label: "GitHub Actions", icon: "🐙" },
  { value: "gitlab_ci", label: "GitLab CI", icon: "🦊" },
  { value: "jenkins", label: "Jenkins", icon: "🔧" },
  { value: "circleci", label: "CircleCI", icon: "⚡" },
  { value: "azure_devops", label: "Azure DevOps", icon: "☁️" },
] as const;

const TRIGGERS = [
  { value: "push", label: "Push to branch" },
  { value: "pull_request", label: "Pull request" },
  { value: "schedule", label: "Scheduled (cron)" },
  { value: "manual", label: "Manual trigger" },
] as const;

type Step = "platform" | "suite" | "trigger" | "review";

export function CIWizard() {
  const { activeWorkspaceId } = useWorkspace();
  const [step, setStep] = useState<Step>("platform");
  const [platform, setPlatform] = useState("");
  const [suiteSlug, setSuiteSlug] = useState("");
  const [suiteName, setSuiteName] = useState("");
  const [environmentName, setEnvironmentName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [branch, setBranch] = useState("main");
  const [scheduleCron, setScheduleCron] = useState("");
  const [copied, setCopied] = useState(false);

  const suitesQuery = useQuery({
    queryKey: ["integrations-list", activeWorkspaceId],
    queryFn: () => integrationsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const environmentsQuery = useQuery({
    queryKey: ["environments", activeWorkspaceId],
    queryFn: () => workspacesApi.listEnvironments(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      integrationsApi.generateCITemplate(activeWorkspaceId!, {
        platform,
        suiteName,
        suiteSlug,
        environmentName,
        trigger,
        branch: branch || undefined,
        scheduleCron: scheduleCron || undefined,
      }),
  });

  const suites = suitesQuery.data ?? [];
  const environments = environmentsQuery.data ?? [];

  const steps: Step[] = ["platform", "suite", "trigger", "review"];
  const stepIndex = steps.indexOf(step);

  const canNext = () => {
    switch (step) {
      case "platform":
        return !!platform;
      case "suite":
        return !!suiteSlug && !!environmentName;
      case "trigger":
        return !!trigger && (trigger !== "schedule" || !!scheduleCron);
      default:
        return false;
    }
  };

  const next = () => {
    const i = stepIndex + 1;
    if (i < steps.length) {
      if (steps[i] === "review") {
        generateMutation.mutate();
      }
      setStep(steps[i] as Step);
    }
  };

  const prev = () => {
    const i = stepIndex - 1;
    if (i >= 0) setStep(steps[i] as Step);
  };

  const handleCopy = () => {
    if (generateMutation.data?.content) {
      navigator.clipboard.writeText(generateMutation.data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CI Integration Wizard</h1>
        <p className="text-slate-500 mt-1">
          Generate a CI pipeline configuration to run your Selora tests automatically.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i < stepIndex
                  ? "bg-green-100 text-green-700"
                  : i === stepIndex
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < stepIndex ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span
              className={`text-sm capitalize ${
                i === stepIndex ? "font-medium text-slate-900" : "text-slate-400"
              }`}
            >
              {s}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-slate-300" />
            )}
          </div>
        ))}
      </div>

      {/* Step: Platform */}
      {step === "platform" && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Choose CI Platform</h2>
          <div className="grid grid-cols-2 gap-4">
            {CI_PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPlatform(p.value)}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  platform === p.value
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="text-2xl block mb-2">{p.icon}</span>
                <span className="font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Step: Suite & Environment */}
      {step === "suite" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Select Suite & Environment</h2>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Test Suite
            </label>
            <Select
              value={suiteSlug}
              onValueChange={(val) => {
                setSuiteSlug(val);
                const s = suites.find((x) => x.suiteSlug === val);
                if (s) setSuiteName(s.suiteName);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a suite" />
              </SelectTrigger>
              <SelectContent>
                {suites.map((s) => (
                  <SelectItem key={s.suiteId} value={s.suiteSlug}>
                    {s.suiteName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Environment
            </label>
            <Select value={environmentName} onValueChange={setEnvironmentName}>
              <SelectTrigger>
                <SelectValue placeholder="Select an environment" />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.name}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {/* Step: Trigger */}
      {step === "trigger" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Configure Trigger</h2>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Trigger Type
            </label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger>
                <SelectValue placeholder="When should tests run?" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(trigger === "push" || trigger === "pull_request") && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Branch
              </label>
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-slate-400" />
                <Input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                />
              </div>
            </div>
          )}
          {trigger === "schedule" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Cron Expression
              </label>
              <Input
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                placeholder="0 6 * * 1-5"
              />
              <p className="text-xs text-slate-500">
                Standard 5-field cron (minute hour day month weekday). Example: "0 6 * * 1-5" runs at 6 AM weekdays.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Generated Configuration</h2>
            {generateMutation.data && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {generateMutation.data.fileName}
                </Badge>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="w-4 h-4 mr-1" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
          </div>

          {generateMutation.isPending && (
            <div className="text-center py-8 text-slate-500">
              <Terminal className="w-8 h-8 mx-auto mb-2 animate-pulse" />
              Generating configuration...
            </div>
          )}

          {generateMutation.isError && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
              Failed to generate configuration. Please go back and verify your selections.
            </div>
          )}

          {generateMutation.data && (
            <>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto max-h-[500px] overflow-y-auto">
                <code>{generateMutation.data.content}</code>
              </pre>
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  Setup Instructions
                </h3>
                <pre className="text-sm text-blue-800 whitespace-pre-wrap">
                  {generateMutation.data.instructions}
                </pre>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prev}
          disabled={stepIndex === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {step !== "review" && (
          <Button onClick={next} disabled={!canNext()}>
            {step === "trigger" ? "Generate" : "Next"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
