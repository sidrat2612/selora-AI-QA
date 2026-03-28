import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import {
  tests as testsApi,
  type TestHealthEntry,
  type TestHealthTrendPoint,
} from "../../lib/api-client";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  HeartPulse,
  ShieldCheck,
  AlertOctagon,
  Activity,
  Wrench,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

const RECOMMENDATION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  healthy: { label: "Healthy", variant: "default" },
  monitor: { label: "Monitor", variant: "secondary" },
  investigate: { label: "Investigate", variant: "outline" },
  needs_rewrite: { label: "Needs Rewrite", variant: "destructive" },
  critical: { label: "Critical", variant: "destructive" },
};

type SortField = "healthScore" | "passRate" | "runCount" | "avgDurationMs";

export function TestHealthDashboard() {
  const { activeWorkspaceId } = useWorkspace();
  const [days, setDays] = useState("14");
  const [sortField, setSortField] = useState<SortField>("healthScore");
  const [sortAsc, setSortAsc] = useState(true);

  const healthQuery = useQuery({
    queryKey: ["test-health", activeWorkspaceId, days],
    queryFn: () => testsApi.getTestHealth(activeWorkspaceId!, { days: parseInt(days, 10) }),
    enabled: !!activeWorkspaceId,
  });

  const trendQuery = useQuery({
    queryKey: ["test-health-trend", activeWorkspaceId, days],
    queryFn: () => testsApi.getTestHealthTrend(activeWorkspaceId!, { days: parseInt(days, 10) }),
    enabled: !!activeWorkspaceId,
  });

  const report = healthQuery.data;
  const trendMap = new Map(
    (trendQuery.data?.trends ?? []).map((t) => [t.testId, t.points]),
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(field === "healthScore"); // default asc for health (worst first)
    }
  };

  const sortedTests = report?.tests
    ? [...report.tests].sort((a, b) => {
        const diff = a[sortField] - b[sortField];
        return sortAsc ? diff : -diff;
      })
    : [];

  if (healthQuery.isLoading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Analyzing test health...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Test Maintenance Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Monitor test health, identify fragile tests, and track AI repair effectiveness.
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Activity className="w-4 h-4" />
              Total Tests
            </div>
            <div className="text-2xl font-bold">{report.totalTests}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
              <ShieldCheck className="w-4 h-4" />
              Healthy
            </div>
            <div className="text-2xl font-bold text-green-700">
              {report.healthyCount}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
              <AlertOctagon className="w-4 h-4" />
              Critical
            </div>
            <div className="text-2xl font-bold text-red-700">
              {report.criticalCount}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <HeartPulse className="w-4 h-4" />
              Avg Pass Rate
            </div>
            <div className="text-2xl font-bold">{report.avgPassRate}%</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Wrench className="w-4 h-4" />
              Repair Success
            </div>
            <div className="text-2xl font-bold">
              {report.repairSuccessRate !== null
                ? `${report.repairSuccessRate}%`
                : "—"}
            </div>
            {report.totalRepairs > 0 && (
              <div className="text-xs text-slate-400 mt-1">
                {report.totalRepairs} attempts
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Test Table */}
      {sortedTests.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Test</TableHead>
                <TableHead className="w-[120px]">Suite</TableHead>
                <TableHead>
                  <SortButton
                    label="Health"
                    active={sortField === "healthScore"}
                    asc={sortAsc}
                    onClick={() => toggleSort("healthScore")}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="Pass Rate"
                    active={sortField === "passRate"}
                    asc={sortAsc}
                    onClick={() => toggleSort("passRate")}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="Runs"
                    active={sortField === "runCount"}
                    asc={sortAsc}
                    onClick={() => toggleSort("runCount")}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="Avg Duration"
                    active={sortField === "avgDurationMs"}
                    asc={sortAsc}
                    onClick={() => toggleSort("avgDurationMs")}
                  />
                </TableHead>
                <TableHead>Repairs</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTests.map((test) => (
                <TestRow key={test.testId} test={test} trend={trendMap.get(test.testId)} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {report && sortedTests.length === 0 && (
        <Card className="p-8 text-center text-slate-500">
          No test runs found in the last {days} days.
        </Card>
      )}
    </div>
  );
}

function SortButton({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={onClick}
    >
      {label}
      <ArrowUpDown
        className={`ml-1 w-3 h-3 ${active ? "text-blue-600" : "text-slate-400"}`}
      />
      {active && (
        <span className="text-[10px] text-blue-600 ml-0.5">
          {asc ? "↑" : "↓"}
        </span>
      )}
    </Button>
  );
}

function TestRow({ test, trend }: { test: TestHealthEntry; trend?: TestHealthTrendPoint[] }) {
  const rec = RECOMMENDATION_LABELS[test.recommendation] ?? {
    label: test.recommendation,
    variant: "outline" as const,
  };

  const healthColor =
    test.healthScore >= 80
      ? "bg-green-500"
      : test.healthScore >= 50
        ? "bg-yellow-500"
        : "bg-red-500";

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/tests/${test.testId}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {test.testName}
        </Link>
        {test.lastFailureSummary && (
          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[240px]">
            {test.lastFailureSummary}
          </p>
        )}
      </TableCell>
      <TableCell>
        <span className="text-xs text-slate-600">
          {test.suiteName ?? "—"}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="w-12 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full ${healthColor}`}
              style={{ width: `${test.healthScore}%` }}
            />
          </div>
          <span className="text-xs font-mono">{test.healthScore}</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm font-mono">{test.passRate}%</span>
        <span className="text-xs text-slate-400 ml-1">
          ({test.passed}/{test.runCount})
        </span>
      </TableCell>
      <TableCell className="text-sm">{test.runCount}</TableCell>
      <TableCell className="text-sm font-mono">
        {formatDuration(test.avgDurationMs)}
      </TableCell>
      <TableCell>
        {test.repairAttempts > 0 ? (
          <span className="text-sm">
            {test.repairSuccesses}/{test.repairAttempts}
          </span>
        ) : (
          <span className="text-slate-400 text-sm">—</span>
        )}
      </TableCell>
      <TableCell>
        {trend && trend.length >= 2 ? (
          <div className="w-20 h-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <Line
                  type="monotone"
                  dataKey="passRate"
                  stroke={test.healthScore >= 80 ? "#22c55e" : test.healthScore >= 50 ? "#eab308" : "#ef4444"}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Tooltip
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as TestHealthTrendPoint | undefined;
                    return p ? (
                      <div className="bg-white border rounded px-2 py-1 text-xs shadow">
                        {p.date}: {p.passRate}% ({p.runCount} runs)
                      </div>
                    ) : null;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={rec.variant}>{rec.label}</Badge>
      </TableCell>
    </TableRow>
  );
}
