import { Link } from "react-router";
import { Plus, Search, MoreHorizontal, FolderKanban, FileCheck2, PlayCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useState } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { suites as suitesApi } from "../../lib/api-client";

export function Suites() {
  const [searchQuery, setSearchQuery] = useState("");
  const { activeWorkspaceId } = useWorkspace();

  const suitesQuery = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const suites = suitesQuery.data ?? [];

  const filteredSuites = suites.filter(suite =>
    suite.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (suite.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Test Suites</h1>
          <p className="mt-1 text-sm text-slate-600">
            Organize and manage test collections for different workflows
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Suite
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search suites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-3">
              <FolderKanban className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Suites</p>
              <p className="text-2xl font-semibold text-slate-900">{suites.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-3">
              <FileCheck2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Tests</p>
              <p className="text-2xl font-semibold text-slate-900">
                {suites.reduce((sum, s) => sum + (s.testCount ?? 0), 0)}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <PlayCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Avg Pass Rate</p>
              <p className="text-2xl font-semibold text-slate-900">—</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Suites Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSuites.map((suite) => (
          <Card key={suite.id} className="p-6 transition-shadow hover:shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Link to={`/suites/${suite.id}`}>
                  <h3 className="font-semibold text-slate-900 hover:text-emerald-600">
                    {suite.name}
                  </h3>
                </Link>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                  {suite.description}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Run Suite</DropdownMenuItem>
                  <DropdownMenuItem>Edit Suite</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <FileCheck2 className="h-4 w-4 text-slate-400" />
                <span className="text-slate-900 font-medium">{suite.testCount ?? 0}</span>
                <span className="text-slate-600">tests</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-sm">
                <StatusBadge status={suite.status} />
              </div>
              <Link to={`/suites/${suite.id}`}>
                <Button variant="ghost" size="sm">View Suite</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
