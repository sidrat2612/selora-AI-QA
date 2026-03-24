import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { PlayCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { suites as suitesApi, workspaces as workspacesApi, runs as runsApi } from "../../lib/api-client";
import { useWorkspace } from "../../lib/workspace-context";

interface CreateRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSuiteId?: string;
}

export function CreateRunDialog({ open, onOpenChange, defaultSuiteId }: CreateRunDialogProps) {
  const [selectedSuite, setSelectedSuite] = useState(defaultSuiteId || "");
  const [selectedEnvironment, setSelectedEnvironment] = useState("");
  const [sourceMode, setSourceMode] = useState("SUITE_DEFAULT");
  const [gitRef, setGitRef] = useState("");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: suiteList = [] } = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && open,
  });

  const { data: envList = [] } = useQuery({
    queryKey: ["environments", activeWorkspaceId],
    queryFn: () => workspacesApi.listEnvironments(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && open,
  });

  const createRunMutation = useMutation({
    mutationFn: () =>
      runsApi.create(activeWorkspaceId!, {
        suiteId: selectedSuite,
        environmentId: selectedEnvironment,
        ...(sourceMode !== "SUITE_DEFAULT" ? { sourceMode } : {}),
        ...(sourceMode === "PINNED_COMMIT" && gitRef ? { gitRef } : {}),
      } as Parameters<typeof runsApi.create>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onOpenChange(false);
      if (!defaultSuiteId) setSelectedSuite("");
      setSelectedEnvironment("");
      setSourceMode("SUITE_DEFAULT");
      setGitRef("");
      setNotifyOnComplete(true);
    },
  });

  const handleCreateRun = () => {
    createRunMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Test Run</DialogTitle>
          <DialogDescription>
            Execute a test suite against a specific environment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="suite">Test Suite</Label>
            <Select value={selectedSuite} onValueChange={setSelectedSuite}>
              <SelectTrigger id="suite">
                <SelectValue placeholder="Select a suite" />
              </SelectTrigger>
              <SelectContent>
                {suiteList.map((suite) => (
                  <SelectItem key={suite.id} value={suite.id}>
                    {suite.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="environment">Environment</Label>
            <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
              <SelectTrigger id="environment">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                {envList.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-mode">Execution Source</Label>
            <Select value={sourceMode} onValueChange={setSourceMode}>
              <SelectTrigger id="source-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUITE_DEFAULT">Suite Default</SelectItem>
                <SelectItem value="STORAGE_ARTIFACT">Storage artifact</SelectItem>
                <SelectItem value="BRANCH_HEAD">Branch HEAD (latest)</SelectItem>
                <SelectItem value="PINNED_COMMIT">Pinned commit</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {sourceMode === "SUITE_DEFAULT" && "Uses the suite execution source policy."}
              {sourceMode === "STORAGE_ARTIFACT" && "Run from stored generated artifact."}
              {sourceMode === "BRANCH_HEAD" && "Fetch latest from the configured branch."}
              {sourceMode === "PINNED_COMMIT" && "Run from a specific git commit SHA."}
            </p>
          </div>

          {sourceMode === "PINNED_COMMIT" && (
            <div className="space-y-2">
              <Label htmlFor="git-ref">Commit SHA</Label>
              <Input id="git-ref" placeholder="e.g., abc1234" value={gitRef} onChange={(e) => setGitRef(e.target.value)} className="font-mono" />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="notify"
              checked={notifyOnComplete}
              onCheckedChange={(checked) => setNotifyOnComplete(checked as boolean)}
            />
            <Label
              htmlFor="notify"
              className="text-sm font-normal cursor-pointer"
            >
              Notify me when run completes
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateRun}
            disabled={!selectedSuite || !selectedEnvironment || createRunMutation.isPending}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {createRunMutation.isPending ? "Starting..." : "Start Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
