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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      onOpenChange(false);
      if (!defaultSuiteId) setSelectedSuite("");
      setSelectedEnvironment("");
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
