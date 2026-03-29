import { Link } from "react-router";
import { AlertTriangle, CheckCircle, TrendingDown } from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { StatusBadge } from "../components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { tests as testsApi, type FlakyTest } from "../../lib/api-client";

export function FlakinessReport() {
  const { activeWorkspaceId } = useWorkspace();

  const reportQuery = useQuery({
    queryKey: ["flakiness-report", activeWorkspaceId],
    queryFn: () => testsApi.getFlakinessReport(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const report = reportQuery.data;

  if (reportQuery.isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Analyzing test stability...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Flakiness Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tests that have both passed and failed in the last {report?.days ?? 14} days
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Flaky Tests</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{report?.flakyCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span>Stable Tests</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{report?.stableCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span>Total Tests Analysed</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">{report?.totalTests ?? 0}</p>
        </Card>
      </div>

      {/* Flaky Tests Table */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-sm font-medium text-foreground">Flaky Tests</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Sorted by flakiness rate (highest first). These tests produce inconsistent results.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test Name</TableHead>
              <TableHead>Flakiness Rate</TableHead>
              <TableHead>Passed</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Total Runs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(report?.flakyTests ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No flaky tests detected. All tests are stable.
                </TableCell>
              </TableRow>
            ) : (
              report!.flakyTests.map((test: FlakyTest) => (
                <TableRow key={test.testId}>
                  <TableCell>
                    <Link
                      to={`/tests/${test.testId}`}
                      className="font-medium text-foreground hover:text-emerald-600"
                    >
                      {test.testName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${test.flakinessRate >= 50 ? "bg-red-500" : test.flakinessRate >= 25 ? "bg-amber-500" : "bg-yellow-400"}`}
                          style={{ width: `${test.flakinessRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{test.flakinessRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-emerald-600 font-medium">{test.passedCount}</TableCell>
                  <TableCell className="text-red-600 font-medium">{test.failedCount}</TableCell>
                  <TableCell className="text-muted-foreground">{test.totalRuns}</TableCell>
                  <TableCell><StatusBadge status={test.testStatus} /></TableCell>
                  <TableCell>
                    <Link to={`/tests/${test.testId}`}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted/50">View</Badge>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
