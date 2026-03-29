import { PlayCircle, Search, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
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
import { useState, useMemo } from "react";
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

  const environmentNames = useMemo(() => {
    const names = new Set<string>();
    for (const run of runs) {
      if (run.environment?.name) names.add(run.environment.name);
    }
    return Array.from(names).sort();
  }, [runs]);

  const filteredRuns = runs.filter(run => {
    const matchesSearch = (run.suite?.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                         run.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || run.status.toLowerCase() === statusFilter;
    const matchesEnvironment = environmentFilter === "all" || run.environment?.name?.toLowerCase() === environmentFilter;
    return matchesSearch && matchesStatus && matchesEnvironment;
  });

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "passed":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "running":
        return <Clock className="h-5 w-5 text-primary animate-pulse" />;
      case "queued":
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      default:
        return <AlertCircle className="h-5 w-5 text-warning" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Test Runs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">Total Runs</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{runs.length}</p>
            </div>
            <PlayCircle className="h-8 w-8 text-muted-foreground/20" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Passed</p>
              <p className="mt-1 text-2xl font-semibold text-success">{runs.filter(r => r.status.toLowerCase() === "passed").length}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-success/20" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Running Now</p>
              <p className="mt-1 text-2xl font-semibold text-primary">{runs.filter(r => r.status.toLowerCase() === "running").length}</p>
            </div>
            <Clock className="h-8 w-8 text-primary/20" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Failed</p>
              <p className="mt-1 text-2xl font-semibold text-destructive">{runs.filter(r => r.status.toLowerCase() === "failed").length}</p>
            </div>
            <XCircle className="h-8 w-8 text-destructive/20" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              {environmentNames.map((name) => (
                <SelectItem key={name} value={name.toLowerCase()}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Runs Table */}
      <div className="rounded-lg border border-border bg-card max-h-[calc(100vh-280px)] overflow-y-auto">
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
                  <Link to={`/runs/${run.id}`} className="font-medium text-primary hover:underline">
                    {run.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="font-medium text-foreground">{run.suite?.name ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{run.environment?.name ?? "—"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(run.status)}
                    <StatusBadge status={run.status} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{run.durationMs != null ? `${Math.round(run.durationMs / 1000)}s` : "—"}</TableCell>
                <TableCell>
                  {run.totalCount != null && run.passedCount != null && run.totalCount > 0 ? (
                    <span className={`font-medium ${run.passedCount === run.totalCount ? 'text-success' : 'text-warning'}`}>
                      {((run.passedCount / run.totalCount) * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{run.triggeredBy?.name ?? run.triggeredBy?.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{run.createdAt}</TableCell>
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

      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredRuns.length} of {runs.length} runs
      </p>

      {/* Create Run Dialog */}
      <CreateRunDialog open={isCreateRunDialogOpen} onOpenChange={setCreateRunDialogOpen} />
    </div>
  );
}