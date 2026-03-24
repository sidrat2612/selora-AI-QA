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
import { Textarea } from "./ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { testCases as testCasesApi } from "../../lib/api-client";
import { useWorkspace } from "../../lib/workspace-context";
import { toast } from "sonner";

interface CreateTestCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suiteId: string;
}

export function CreateTestCaseDialog({
  open,
  onOpenChange,
  suiteId,
}: CreateTestCaseDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<"SIMPLE" | "STRUCTURED">("SIMPLE");
  const [priority, setPriority] = useState<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [preconditions, setPreconditions] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      testCasesApi.create(activeWorkspaceId!, suiteId, {
        title: title.trim(),
        description: description.trim() || undefined,
        format,
        priority,
        preconditions: preconditions.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", activeWorkspaceId, suiteId] });
      toast.success("Test case created.");
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create test case.");
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFormat("SIMPLE");
    setPriority("MEDIUM");
    setPreconditions("");
    setExpectedResult("");
  };

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Business Test Case</DialogTitle>
          <DialogDescription>
            Define what needs to be validated. Map automation scripts later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tc-title">Title</Label>
            <Input
              id="tc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User can log in with valid credentials"
              disabled={createMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tc-description">Description</Label>
            <Textarea
              id="tc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional detailed description..."
              rows={2}
              disabled={createMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIMPLE">Simple</SelectItem>
                  <SelectItem value="STRUCTURED">Structured</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tc-preconditions">Preconditions</Label>
            <Textarea
              id="tc-preconditions"
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              placeholder="What must be true before this test runs..."
              rows={2}
              disabled={createMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tc-expected">Expected Result</Label>
            <Textarea
              id="tc-expected"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              placeholder="What should happen when this test passes..."
              rows={2}
              disabled={createMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Test Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
