import { Link, useParams } from "react-router";
import { ArrowLeft, PlayCircle, Edit, Trash2, FileCheck2, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { StatusBadge } from "../components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { ExecutionPolicy } from "../components/suite-settings/ExecutionPolicy";
import { GitHubIntegration } from "../components/suite-settings/GitHubIntegration";
import { TestRailIntegration } from "../components/suite-settings/TestRailIntegration";
import { RolloutControls } from "../components/suite-settings/RolloutControls";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { suites as suitesApi, tests as testsApi, runs as runsApi } from "../../lib/api-client";

export function SuiteDetail() {
  const { id } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();

  const suiteQuery = useQuery({
    queryKey: ["suite", activeWorkspaceId, id],
    queryFn: () => suitesApi.get(activeWorkspaceId!, id!),
    enabled: !!activeWorkspaceId && !!id,
  });

  const testsQuery = useQuery({
    queryKey: ["tests", activeWorkspaceId, { suiteId: id }],
    queryFn: () => testsApi.list(activeWorkspaceId!, { suiteId: id }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const runsQuery = useQuery({
    queryKey: ["runs", activeWorkspaceId, { suiteId: id }],
    queryFn: () => runsApi.list(activeWorkspaceId!, { suiteId: id }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const suite = suiteQuery.data;
  const suiteTests = testsQuery.data ?? [];
  const suiteRuns = runsQuery.data ?? [];

  if (!suite && suiteQuery.isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!suite) {
    return <div className="p-8 text-center text-slate-500">Suite not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link to="/suites">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Suites
        </Button>
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{suite.name}</h1>
          <p className="mt-2 text-sm text-slate-600">{suite.description ?? ""}</p>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
            <span>Created: {suite.createdAt}</span>
            <span>•</span>
            <span>{suite.testCount ?? suiteTests.length} tests</span>
          </div>
        </div>
        <div className="flex gap-2">
          {permissions.canAuthorAutomation && (
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {permissions.canAuthorAutomation && (
            <Button variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
          {permissions.canOperateRuns && (
            <Button>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Suite
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileCheck2 className="h-4 w-4" />
            <span>Total Tests</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{suite.testCount ?? suiteTests.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <PlayCircle className="h-4 w-4" />
            <span>Total Runs</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{suiteRuns.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <TrendingUp className="h-4 w-4" />
            <span>Status</span>
          </div>
          <div className="mt-2"><StatusBadge status={suite.status} /></div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tests" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tests">Tests ({suiteTests.length})</TabsTrigger>
          <TabsTrigger value="runs">Run History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="tests">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suiteTests.map((test) => (
                  <TableRow key={test.id}>
                    <TableCell>
                      <Link to={`/tests/${test.id}`} className="font-medium text-slate-900 hover:text-emerald-600">
                        {test.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={test.status} />
                    </TableCell>
                    <TableCell>
                      {test.lastRunStatus ? <StatusBadge status={test.lastRunStatus} /> : "—"}
                    </TableCell>
                    <TableCell>
                      <Link to={`/tests/${test.id}`}>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suiteRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link to={`/runs/${run.id}`} className="font-medium text-emerald-600 hover:underline">
                        {run.id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{run.createdAt}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="text-slate-600">{run.duration != null ? `${Math.round(run.duration / 1000)}s` : "—"}</TableCell>
                    <TableCell>
                      <Link to={`/runs/${run.id}`}>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-slate-900">Suite Settings</h3>
            <p className="mt-1 text-sm text-slate-600">Configure execution policy and integrations</p>
            <div className="mt-6 space-y-4">
              <ExecutionPolicy />
              <GitHubIntegration />
              <TestRailIntegration />
              <RolloutControls />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}