import { useState } from "react";
import { Link } from "react-router";
import { Search, Filter, MessageSquare, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { StatusBadge } from "../components/StatusBadge";
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
import { feedback as feedbackApi } from "../../lib/api-client";

export function Feedback() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const { activeWorkspaceId } = useWorkspace();

  const feedbackQuery = useQuery({
    queryKey: ["feedback", activeWorkspaceId],
    queryFn: () => feedbackApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const feedbackItems = feedbackQuery.data ?? [];

  const filteredFeedback = feedbackItems.filter(item => {
    const matchesSearch = (item.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.summary ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || item.category === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Feedback</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review AI quality feedback, failures, and flagged cases
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Items</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{feedbackItems.length}</p>
            </div>
            <MessageSquare className="h-8 w-8 text-slate-200" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Needs Review</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">
                {feedbackItems.filter(i => i.status === "needs_review" || i.status === "needs_human_review").length}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-100" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Resolved</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">
                {feedbackItems.filter(i => i.status === "validated" || i.status === "resolved").length}
              </p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-100" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search feedback..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="AI Quality">AI Quality</SelectItem>
              <SelectItem value="Test Failure">Test Failure</SelectItem>
              <SelectItem value="Environment Issue">Environment</SelectItem>
              <SelectItem value="Validation">Validation</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
          </Button>
        </div>
      </div>

      {/* Feedback List */}
      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {filteredFeedback.map((item) => (
          <Card key={item.id} className="p-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <MessageSquare className="h-5 w-5 text-slate-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{item.category}</Badge>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-2 font-medium text-slate-900">{item.summary}</p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      {item.title && <span>{item.title}</span>}
                      <span>{item.createdAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
