import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Save, Zap } from "lucide-react";
import { useParams } from "react-router";
import { useWorkspace } from "../../../lib/workspace-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { suites as suitesApi } from "../../../lib/api-client";
import { toast } from "sonner";
import { useState } from "react";

type RolloutControlsProps = {
  rollout?: {
    stage: string;
    githubPublishingEnabled: boolean;
    gitExecutionEnabled: boolean;
    testRailSyncEnabled: boolean;
  } | null;
};

export function RolloutControls({ rollout }: RolloutControlsProps) {
  const { id: suiteId } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState(rollout?.stage ?? "INTERNAL");
  const [githubEnabled, setGithubEnabled] = useState(rollout?.githubPublishingEnabled ?? true);
  const [gitExecEnabled, setGitExecEnabled] = useState(rollout?.gitExecutionEnabled ?? true);
  const [testRailEnabled, setTestRailEnabled] = useState(rollout?.testRailSyncEnabled ?? true);

  const saveMutation = useMutation({
    mutationFn: () => suitesApi.update(activeWorkspaceId!, suiteId!, {
      rolloutStage: stage,
      githubPublishingEnabled: githubEnabled,
      gitExecutionEnabled: gitExecEnabled,
      testRailSyncEnabled: testRailEnabled,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("Rollout settings saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  const stageColors: Record<string, string> = {
    INTERNAL: "bg-slate-100 text-slate-700",
    PILOT: "bg-amber-50 text-amber-700 border-amber-200",
    GENERAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Rollout Controls</h3>
            <p className="text-sm text-muted-foreground">
              Manage progressive feature rollout for this suite
            </p>
          </div>
          <Badge className={stageColors[stage] ?? "bg-slate-100 text-slate-700"}>
            <Zap className="mr-1 h-3 w-3" />
            {stage}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rollout-stage">Rollout Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger id="rollout-stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL">Internal</SelectItem>
                <SelectItem value="PILOT">Pilot</SelectItem>
                <SelectItem value="GENERAL">General Availability</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {stage === "INTERNAL" && "Only internal users can access this suite's features."}
              {stage === "PILOT" && "Available to selected pilot teams."}
              {stage === "GENERAL" && "Available to all users."}
            </p>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Feature Flags</h4>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>GitHub Publishing</Label>
                <p className="text-sm text-muted-foreground">Allow artifact publication to GitHub</p>
              </div>
              <Switch checked={githubEnabled} onCheckedChange={setGithubEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Git Execution</Label>
                <p className="text-sm text-muted-foreground">Allow execution from git sources</p>
              </div>
              <Switch checked={gitExecEnabled} onCheckedChange={setGitExecEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>TestRail Sync</Label>
                <p className="text-sm text-muted-foreground">Allow TestRail synchronization</p>
              </div>
              <Switch checked={testRailEnabled} onCheckedChange={setTestRailEnabled} />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
