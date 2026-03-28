import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import {
  visualRegression,
  type VisualBaseline,
  type VisualDiffResult,
} from "../../lib/api-client";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Input } from "../components/ui/input";
import {
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  ImagePlus,
  SplitSquareVertical,
  Columns,
  Layers,
  SlidersHorizontal,
} from "lucide-react";

type ComparisonMode = "side-by-side" | "overlay" | "slider";

export function VisualRegressionPage() {
  const { id: testId } = useParams<{ id: string }>();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [compareRunItemId, setCompareRunItemId] = useState("");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("side-by-side");

  const baselinesQuery = useQuery({
    queryKey: ["visual-baselines", activeWorkspaceId, testId],
    queryFn: () => visualRegression.listBaselines(activeWorkspaceId!, testId!),
    enabled: !!activeWorkspaceId && !!testId,
  });

  const compareQuery = useQuery({
    queryKey: ["visual-compare", activeWorkspaceId, testId, compareRunItemId],
    queryFn: () =>
      visualRegression.compare(activeWorkspaceId!, testId!, compareRunItemId),
    enabled: !!activeWorkspaceId && !!testId && !!compareRunItemId,
  });

  const deleteMutation = useMutation({
    mutationFn: (baselineId: string) =>
      visualRegression.deleteBaseline(activeWorkspaceId!, baselineId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["visual-baselines", activeWorkspaceId, testId],
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (stepIndex: number) =>
      visualRegression.approveAsBaseline(activeWorkspaceId!, testId!, {
        runItemId: compareRunItemId,
        stepIndex,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["visual-baselines", activeWorkspaceId, testId],
      });
      queryClient.invalidateQueries({
        queryKey: ["visual-compare", activeWorkspaceId, testId],
      });
    },
  });

  const baselines = baselinesQuery.data ?? [];
  const diffs = compareQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Visual Regression
        </h1>
        <p className="text-slate-500 mt-1">
          Manage visual baselines and compare screenshots against them.
        </p>
      </div>

      {/* Baselines Section */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Baselines
            <Badge variant="secondary">{baselines.length} steps</Badge>
          </h2>
        </div>

        {baselines.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ImagePlus className="w-10 h-10 mx-auto mb-2" />
            <p>No baselines yet. Run a test and approve screenshots to create baselines.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {baselines.map((b) => (
                <BaselineRow
                  key={b.id}
                  baseline={b}
                  onDelete={() => deleteMutation.mutate(b.id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Comparison Section */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <SplitSquareVertical className="w-5 h-5" />
            Compare Run Screenshots
          </h2>

          {/* Comparison Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <Button
              variant={comparisonMode === "side-by-side" ? "default" : "ghost"}
              size="sm"
              onClick={() => setComparisonMode("side-by-side")}
              className="h-7 px-2"
            >
              <Columns className="w-3.5 h-3.5 mr-1" />
              Side by Side
            </Button>
            <Button
              variant={comparisonMode === "overlay" ? "default" : "ghost"}
              size="sm"
              onClick={() => setComparisonMode("overlay")}
              className="h-7 px-2"
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              Overlay
            </Button>
            <Button
              variant={comparisonMode === "slider" ? "default" : "ghost"}
              size="sm"
              onClick={() => setComparisonMode("slider")}
              className="h-7 px-2"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
              Slider
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="Enter Run Item ID to compare..."
            value={compareRunItemId}
            onChange={(e) => setCompareRunItemId(e.target.value)}
            className="max-w-md"
          />
          {compareQuery.isLoading && (
            <span className="text-sm text-slate-400">Comparing...</span>
          )}
        </div>

        {diffs.length > 0 && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">
                {diffs.filter((d) => d.status === "MATCH").length} matched
              </span>
              <span className="text-red-600">
                {diffs.filter((d) => d.status === "MISMATCH").length} mismatched
              </span>
              <span className="text-yellow-600">
                {diffs.filter((d) => d.status === "NO_BASELINE").length} no
                baseline
              </span>
            </div>

            {/* Diff Results */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Diff %</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Baseline</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffs.map((diff) => (
                  <DiffRow
                    key={diff.stepIndex}
                    diff={diff}
                    mode={comparisonMode}
                    onApprove={() => approveMutation.mutate(diff.stepIndex)}
                    isApproving={approveMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function BaselineRow({
  baseline,
  onDelete,
  isDeleting,
}: {
  baseline: VisualBaseline;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{baseline.stepIndex}</TableCell>
      <TableCell>{baseline.stepLabel ?? "—"}</TableCell>
      <TableCell className="text-sm">{formatBytes(baseline.sizeBytes)}</TableCell>
      <TableCell className="text-sm">
        {baseline.width > 0 ? `${baseline.width}×${baseline.height}` : "—"}
      </TableCell>
      <TableCell>
        {baseline.approvedAt ? (
          <span className="text-xs text-slate-500">
            {baseline.approvedBy?.name ?? "System"} ·{" "}
            {new Date(baseline.approvedAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Not approved</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DiffRow({
  diff,
  mode,
  onApprove,
  isApproving,
}: {
  diff: VisualDiffResult;
  mode: ComparisonMode;
  onApprove: () => void;
  isApproving: boolean;
}) {
  const [sliderPos, setSliderPos] = useState(50);

  const statusConfig = {
    MATCH: {
      icon: <CheckCircle className="w-4 h-4 text-green-500" />,
      label: "Match",
      variant: "default" as const,
    },
    MISMATCH: {
      icon: <XCircle className="w-4 h-4 text-red-500" />,
      label: "Mismatch",
      variant: "destructive" as const,
    },
    NO_BASELINE: {
      icon: <AlertCircle className="w-4 h-4 text-yellow-500" />,
      label: "No Baseline",
      variant: "secondary" as const,
    },
  };

  const classificationLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    real_regression: { label: "Real Regression", variant: "destructive" },
    noise: { label: "Noise", variant: "secondary" },
    layout_shift: { label: "Layout Shift", variant: "outline" },
    dynamic_content: { label: "Dynamic Content", variant: "secondary" },
  };

  const cfg = statusConfig[diff.status];

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{diff.stepIndex}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {cfg.icon}
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </TableCell>
      <TableCell>
        {diff.status === "MISMATCH" ? (
          <div className="flex items-center gap-2">
            <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500"
                style={{ width: `${Math.min(diff.diffPercentage, 100)}%` }}
              />
            </div>
            <span className="text-xs font-mono">{diff.diffPercentage.toFixed(1)}%</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell>
        {diff.classification ? (
          <div className="flex items-center gap-1">
            <Badge variant={classificationLabels[diff.classification]?.variant ?? "outline"}>
              {classificationLabels[diff.classification]?.label ?? diff.classification}
            </Badge>
            {diff.classificationConfidence != null && (
              <span className="text-[10px] text-slate-400">
                {Math.round(diff.classificationConfidence * 100)}%
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs font-mono text-slate-500 truncate max-w-[120px]">
        {diff.baselineStorageKey ? (
          mode === "side-by-side" ? (
            <span title={diff.baselineStorageKey}>Baseline</span>
          ) : mode === "overlay" ? (
            <span className="text-blue-500">Layer A</span>
          ) : (
            <span className="text-blue-500">← Slide →</span>
          )
        ) : "—"}
      </TableCell>
      <TableCell className="text-xs font-mono text-slate-500 truncate max-w-[120px]">
        {diff.currentStorageKey ? (
          mode === "slider" ? (
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="w-16 h-1"
              />
              <span className="text-[10px]">{sliderPos}%</span>
            </div>
          ) : "Current"
        ) : "—"}
      </TableCell>
      <TableCell>
        {(diff.status === "MISMATCH" || diff.status === "NO_BASELINE") && (
          <Button
            size="sm"
            variant="outline"
            onClick={onApprove}
            disabled={isApproving}
          >
            Approve
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
