import { PlayCircle, Search, Filter, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { StatusBadge } from "../components/StatusBadge";
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
import { Link } from "react-router";
import { useState } from "react";
import { CreateRunDialog } from "../components/CreateRunDialog";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { runs as runsApi } from "../../lib/api-client";

export function Runs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [isCreateRunDialogOpen, setCreateRunDialogOpen] = useState(false);
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();

  const runsQuery = useQuery({
    queryKey: ["runs", activeWorkspaceId],
    queryFn: () => runsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const runs = runsQuery.data ?? [];

  const filteredRuns = runs.filter(run => {
    const matchesSearch = (run.suiteName ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                         run.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || run.status === statusFilter;
    const matchesEnvironment = environmentFilter === "all" || run.environmentName === environmentFilter;
    return matchesSearch && matchesStatus && matchesEnvironment;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "running":
        return <Clock className="h-5 w-5 text-blue-600 animate-pulse" />;
      case "queued":
        return <Clock className="h-5 w-5 text-slate-400" />;
      default:
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Test Runs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor and review test execution history
          </p>
        </div>
        {permissions.canOperateRuns && (
          <Button variant="outline" onClick={() => setCreateRunDialogOpen(true)}>
            Create Run
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Runs</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{runs.length}</p>
            </div>
            <PlayCircle className="h-8 w-8 text-slate-300" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Passed</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{runs.filter(r => r.status === "passed").length}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-100" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Running Now</p>
              <p className="mt-1 text-2xl font-semibold text-blue-600">{runs.filter(r => r.status === "running").length}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-100" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Failed</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{runs.filter(r => r.status === "failed").length}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-100" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search runs or suites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Environments</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
          </Button>
        </div>
      </div>

      {/* Runs Table */}
      <div className="rounded-lg border border-slate-200 bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run ID</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Pass Rate</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRuns.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Link to={`/runs/${run.id}`} className="font-medium text-emerald-600 hover:underline">
                    {run.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="font-medium text-slate-900">{run.suiteName ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{run.environmentName ?? "—"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(run.status)}
                    <StatusBadge status={run.status} />
                  </div>
                </TableCell>
                <TableCell className="text-slate-600">{run.duration != null ? `${Math.round(run.duration / 1000)}s` : "—"}</TableCell>
                <TableCell>
                  {run.totalTests != null && run.passedTests != null ? (
                    <span className={`font-medium ${run.passedTests === run.totalTests ? 'text-green-600' : 'text-amber-600'}`}>
                      {((run.passedTests / run.totalTests) * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-600">—</TableCell>
                <TableCell className="text-slate-600 text-sm">{run.createdAt}</TableCell>
                <TableCell>
                  <Link to={`/runs/${run.id}`}>
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Showing {filteredRuns.length} of {runs.length} runs
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm">
            Next
          </Button>
        </div>
      </div>

      {/* Create Run Dialog */}
      <CreateRunDialog open={isCreateRunDialogOpen} onOpenChange={setCreateRunDialogOpen} />
    </div>
  );
}