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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tests as testsApi, testCases as testCasesApi } from "../../lib/api-client";
import { useWorkspace } from "../../lib/workspace-context";
import { toast } from "sonner";

interface MapScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suiteId: string;
  testCaseId: string;
  existingMappingIds: string[];
}

export function MapScriptDialog({
  open,
  onOpenChange,
  suiteId,
  testCaseId,
  existingMappingIds,
}: MapScriptDialogProps) {
  const [selectedScript, setSelectedScript] = useState("");
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const scriptsQuery = useQuery({
    queryKey: ["tests", activeWorkspaceId, { suiteId }],
    queryFn: () => testsApi.list(activeWorkspaceId!, { suiteId }),
    enabled: !!activeWorkspaceId && open,
  });

  const addMappingMutation = useMutation({
    mutationFn: () =>
      testCasesApi.addMapping(activeWorkspaceId!, suiteId, testCaseId, {
        canonicalTestId: selectedScript,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["test-cases", activeWorkspaceId, suiteId],
      });
      queryClient.invalidateQueries({
        queryKey: ["test-case-mappings", activeWorkspaceId, suiteId, testCaseId],
      });
      toast.success("Script mapped to test case.");
      setSelectedScript("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to map script.");
    },
  });

  const availableScripts = (scriptsQuery.data ?? []).filter(
    (s) => !existingMappingIds.includes(s.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Map Automation Script</DialogTitle>
          <DialogDescription>
            Link an automation script to this business test case.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Automation Script</Label>
            <Select value={selectedScript} onValueChange={setSelectedScript}>
              <SelectTrigger>
                <SelectValue placeholder="Select a script..." />
              </SelectTrigger>
              <SelectContent>
                {availableScripts.map((script) => (
                  <SelectItem key={script.id} value={script.id}>
                    {script.title}
                  </SelectItem>
                ))}
                {availableScripts.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-slate-500">
                    No unmapped scripts available
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => addMappingMutation.mutate()}
            disabled={!selectedScript || addMappingMutation.isPending}
          >
            {addMappingMutation.isPending ? "Mapping..." : "Map Script"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
