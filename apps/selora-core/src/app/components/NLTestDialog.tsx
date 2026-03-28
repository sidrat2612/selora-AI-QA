import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { tests as testsApi, suites as suitesApi, type Suite } from "../../lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";

type NLTestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PROMPT_EXAMPLES = [
  "Log in with valid credentials, navigate to dashboard, verify welcome message appears",
  "Search for 'laptop' in the product catalog, add first result to cart, verify cart count updates",
  "Fill out the contact form with name, email, and message, submit, verify success notification",
  "Navigate to settings page, change display name, save, verify the name is updated",
];

export function NLTestDialog({ open, onOpenChange }: NLTestDialogProps) {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [suiteId, setSuiteId] = useState("");

  const suitesQuery = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && open,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      testsApi.generateFromPrompt(activeWorkspaceId!, {
        prompt,
        name: name.trim() || undefined,
        suiteId: suiteId || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tests", activeWorkspaceId] });
      toast.success(`Test "${result.testName}" generated! Validation in progress.`);
      onOpenChange(false);
      setPrompt("");
      setName("");
      setSuiteId("");
      navigate(`/tests/${result.testId}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to generate test.");
    },
  });

  const suites = suitesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            Create Test from Description
          </DialogTitle>
          <DialogDescription>
            Describe what the test should do in plain English. AI will generate a
            complete Playwright test script for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nl-prompt">Test Description</Label>
            <textarea
              id="nl-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the test scenario..."
              rows={5}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              disabled={generateMutation.isPending}
            />
            <p className="text-xs text-slate-500">{prompt.length}/5000 characters</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Examples (click to use):</Label>
            <div className="flex flex-wrap gap-1">
              {PROMPT_EXAMPLES.map((example, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 text-left"
                >
                  {example.slice(0, 60)}...
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nl-name">Test Name (optional)</Label>
              <Input
                id="nl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-generated from description"
                disabled={generateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nl-suite">Assign to Suite (optional)</Label>
              <select
                id="nl-suite"
                value={suiteId}
                onChange={(e) => setSuiteId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                disabled={generateMutation.isPending}
              >
                <option value="">No suite</option>
                {suites.map((s: Suite) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!prompt.trim() || generateMutation.isPending}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {generateMutation.isPending ? "Generating..." : "Generate Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
