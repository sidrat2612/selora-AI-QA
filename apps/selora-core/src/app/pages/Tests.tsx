import { useState } from "react";
import { Link } from "react-router";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Upload,
  PlayCircle,
  Archive,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { StatusBadge } from "../components/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { usePermissions } from "../../lib/auth-context";
import { tests as testsApi } from "../../lib/api-client";

export function Tests() {
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();

  const testsQuery = useQuery({
    queryKey: ["tests", activeWorkspaceId],
    queryFn: () => testsApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const tests = testsQuery.data ?? [];

  const filteredTests = tests.filter(test => {
    const matchesSearch = test.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (test.suiteName ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || test.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSelectAll = () => {
    if (selectedTests.length === filteredTests.length) {
      setSelectedTests([]);
    } else {
      setSelectedTests(filteredTests.map(t => t.id));
    }
  };

  const handleSelectTest = (id: string) => {
    setSelectedTests(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tests</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage and monitor all generated tests across suites
          </p>
        </div>
        <div className="flex gap-3">
          {permissions.canAuthorAutomation && (
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Upload Recording
            </Button>
          )}
          {permissions.canOperateRuns && selectedTests.length > 0 && (
            <Button>
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Selected ({selectedTests.length})
            </Button>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search tests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="validated">Validated</SelectItem>
              <SelectItem value="validating">Validating</SelectItem>
              <SelectItem value="needs_human_review">Needs Review</SelectItem>
              <SelectItem value="auto_repaired">Auto Repaired</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedTests.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-medium text-emerald-900">
            {selectedTests.length} test{selectedTests.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <PlayCircle className="mr-2 h-4 w-4" />
              Run
            </Button>
            <Button size="sm" variant="outline">
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          </div>
        </div>
      )}

      {/* Tests Table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedTests.length === filteredTests.length && filteredTests.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Test Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Compatibility</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTests.map((test) => (
              <TableRow key={test.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedTests.includes(test.id)}
                    onCheckedChange={() => handleSelectTest(test.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    to={`/tests/${test.id}`}
                    className="font-medium text-slate-900 hover:text-emerald-600"
                  >
                    {test.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={test.status} />
                </TableCell>
                <TableCell>
                  <span className="text-slate-600">
                    {test.suiteName ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">{test.lastRunStatus ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-400">—</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-400">—</span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Run Test</DropdownMenuItem>
                      <DropdownMenuItem>View History</DropdownMenuItem>
                      <DropdownMenuItem>Edit Metadata</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">Archive</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Showing {filteredTests.length} of {tests.length} tests
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
    </div>
  );
}
