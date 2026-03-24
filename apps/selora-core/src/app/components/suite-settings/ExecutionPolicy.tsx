import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Save } from "lucide-react";
import { useParams } from "react-router";
import { useWorkspace } from "../../../lib/workspace-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { suites as suitesApi } from "../../../lib/api-client";
import { toast } from "sonner";

type ExecutionPolicyProps = {
  policy?: {
    defaultMode: string;
    allowBranchHeadExecution: boolean;
    allowStorageExecutionFallback: boolean;
  } | null;
};

export function ExecutionPolicy({ policy }: ExecutionPolicyProps) {
  const { id: suiteId } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [sourceMode, setSourceMode] = useState(policy?.defaultMode ?? "STORAGE_ARTIFACT");
  const [allowBranchHead, setAllowBranchHead] = useState(policy?.allowBranchHeadExecution ?? false);
  const [allowFallback, setAllowFallback] = useState(policy?.allowStorageExecutionFallback ?? true);

  const saveMutation = useMutation({
    mutationFn: () => suitesApi.update(activeWorkspaceId!, suiteId!, {
      executionSourcePolicy: sourceMode,
      allowBranchHeadExecution: allowBranchHead,
      allowStorageExecutionFallback: allowFallback,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("Execution policy saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Execution Policy</h3>
          <p className="text-sm text-muted-foreground">
            Configure source resolution and fallback behavior for this suite
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exec-source-mode">Default source mode</Label>
            <Select value={sourceMode} onValueChange={setSourceMode}>
              <SelectTrigger id="exec-source-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="STORAGE_ARTIFACT">Storage artifact</SelectItem>
                <SelectItem value="PINNED_COMMIT">Pinned commit</SelectItem>
                <SelectItem value="BRANCH_HEAD">Branch HEAD</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {sourceMode === "STORAGE_ARTIFACT" && "Execute from stored generated artifacts."}
              {sourceMode === "PINNED_COMMIT" && "Execute from a specific git commit."}
              {sourceMode === "BRANCH_HEAD" && "Always fetch latest from the default branch."}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow branch HEAD execution</Label>
              <p className="text-sm text-muted-foreground">
                Permit runs to use the latest branch HEAD
              </p>
            </div>
            <Switch checked={allowBranchHead} onCheckedChange={setAllowBranchHead} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow storage fallback</Label>
              <p className="text-sm text-muted-foreground">
                Fall back to storage artifacts if git resolution fails
              </p>
            </div>
            <Switch checked={allowFallback} onCheckedChange={setAllowFallback} />
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
