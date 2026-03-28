import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Zap, Globe, Code, Search, MoreHorizontal, Trash2, Play } from "lucide-react";
import { Button } from "../components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { apiTests, type ApiTestDefinition } from "../../lib/api-client";
import { toast } from "sonner";

export function ApiTestsList() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["api-tests", activeWorkspaceId],
    queryFn: () => apiTests.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiTests.delete(activeWorkspaceId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-tests"] });
      toast.success("API test deleted.");
    },
    onError: () => toast.error("Failed to delete API test."),
  });

  const items = (data?.items ?? []).filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const statusColor = (s: string) => {
    if (s === "READY") return "bg-emerald-100 text-emerald-800";
    if (s === "ARCHIVED") return "bg-slate-100 text-slate-600";
    return "bg-amber-100 text-amber-800";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">API Tests</h1>
          <p className="mt-1 text-sm text-slate-500">
            REST & GraphQL API tests with assertion validation
          </p>
        </div>
        <Button onClick={() => navigate("/api-tests/create")}>
          <Plus className="mr-2 h-4 w-4" />
          New API Test
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-2xl font-bold text-slate-900">{data?.totalCount ?? 0}</div>
          <p className="text-sm text-slate-500">Total Tests</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-emerald-600">
            {(data?.items ?? []).filter((t) => t.status === "READY").length}
          </div>
          <p className="text-sm text-slate-500">Ready</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-amber-600">
            {(data?.items ?? []).filter((t) => t.status === "DRAFT").length}
          </div>
          <p className="text-sm text-slate-500">Drafts</p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search API tests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Executions</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                  No API tests yet. Create your first test to get started.
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/api-tests/${t.id}`)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {t.protocol === "GRAPHQL" ? (
                        <Code className="h-4 w-4 text-purple-500" />
                      ) : (
                        <Globe className="h-4 w-4 text-blue-500" />
                      )}
                      {t.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{t.protocol}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-mono">{t.method}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-xs text-slate-600">
                    {t.urlTemplate}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor(t.status)}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {t.suite?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {t._count?.executions ?? 0}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/api-tests/${t.id}`); }}>
                          <Zap className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
