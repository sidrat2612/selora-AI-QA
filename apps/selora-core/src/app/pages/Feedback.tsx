import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Search, MessageSquare, AlertTriangle, Info, CheckCircle2, Sparkles, ThumbsUp, ThumbsDown } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { feedback as feedbackApi } from "../../lib/api-client";

export function Feedback() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const { activeWorkspaceId } = useWorkspace();

  const feedbackQuery = useQuery({
    queryKey: ["feedback", activeWorkspaceId],
    queryFn: () => feedbackApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const feedbackItems = feedbackQuery.data ?? [];

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of feedbackItems) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [feedbackItems]);

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
          <p className="text-xs font-semibold tracking-widest text-ai-accent uppercase mb-1">AI Quality</p>
          <h1 className="text-2xl font-semibold text-foreground">Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review AI quality feedback, failures, and flagged cases
          </p>
        </div>
      </div>

      {/* AI Confidence Card */}
      <Card className="p-6 bg-ai-accent-muted border-ai-accent/20">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-5 w-5 text-ai-accent" />
          <h3 className="font-semibold text-foreground">AI Confidence Overview</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{feedbackItems.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Needs Review</p>
            <p className="mt-1 text-2xl font-semibold text-warning">
              {feedbackItems.filter(i => i.status === "needs_review" || i.status === "needs_human_review").length}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Resolved</p>
            <p className="mt-1 text-2xl font-semibold text-success">
              {feedbackItems.filter(i => i.status === "validated" || i.status === "resolved").length}
            </p>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Feedback List */}
      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {filteredFeedback.map((item) => (
          <Card key={item.id} className="p-6 cursor-pointer hover:bg-surface-container-low transition-colors" onClick={() => setSelectedItem(item as unknown as Record<string, unknown>)}>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{item.category}</Badge>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-2 font-medium text-foreground">{item.summary}</p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      {item.title && <span>{item.title}</span>}
                      <span>{item.createdAt}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:text-success" onClick={(e) => e.stopPropagation()}>
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Detail Side Panel */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-ai-accent" />
              Feedback Detail
            </SheetTitle>
            <SheetDescription>
              {String(selectedItem?.category ?? "Feedback")} — {String(selectedItem?.status ?? "")}
            </SheetDescription>
          </SheetHeader>
          {selectedItem && (
            <div className="mt-6 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Summary</h4>
                <p className="text-sm text-muted-foreground">{String(selectedItem.summary)}</p>
              </div>
              {!!selectedItem.title && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Title</h4>
                  <p className="text-sm text-muted-foreground">{String(selectedItem.title)}</p>
                </div>
              )}
              {/* Diff-style recommendation view */}
              {!!selectedItem.recommendation && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">AI Recommendation</h4>
                  <Card className="p-4 bg-ai-accent-muted border-ai-accent/20">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                      {String(selectedItem.recommendation)}
                    </pre>
                  </Card>
                </div>
              )}
              {!!selectedItem.originalValue && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Original</h4>
                  <Card className="p-4 bg-destructive/5 border-destructive/20">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                      {String(selectedItem.originalValue)}
                    </pre>
                  </Card>
                </div>
              )}
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => setSelectedItem(null)}>
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Accept
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setSelectedItem(null)}>
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
