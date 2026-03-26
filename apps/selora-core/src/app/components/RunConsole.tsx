import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Download, Copy, Check, ArrowDown } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";
import { runs as runsApi, type RunItem } from "../../lib/api-client";
import { useWorkspace } from "../../lib/workspace-context";
import { useQuery } from "@tanstack/react-query";

interface LogLine {
  stream: "stdout" | "stderr" | "system";
  line: string;
  ts: number;
}

interface RunConsoleProps {
  runId: string;
  items: RunItem[];
  runStatus: string;
}

export function RunConsole({ runId, items, runStatus }: RunConsoleProps) {
  const { activeWorkspaceId } = useWorkspace();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [liveLines, setLiveLines] = useState<LogLine[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => i.id === selectedItemId);
  const isItemRunning =
    selectedItem?.status === "RUNNING" || selectedItem?.status === "QUEUED";
  const isRunActive =
    runStatus === "RUNNING" ||
    runStatus === "QUEUED" ||
    runStatus === "running" ||
    runStatus === "queued";

  // Fetch stored logs for completed items
  const storedLogQuery = useQuery({
    queryKey: [
      "run-item-log",
      activeWorkspaceId,
      runId,
      selectedItemId,
    ],
    queryFn: () =>
      runsApi.getItemLog(activeWorkspaceId!, runId, selectedItemId!),
    enabled:
      !!activeWorkspaceId && !!selectedItemId && !isItemRunning,
    staleTime: 30_000,
  });

  // SSE live streaming for running items
  useEffect(() => {
    if (!activeWorkspaceId || !selectedItemId || !isItemRunning) {
      return;
    }

    setLiveLines([]);

    const url = runsApi.liveLogUrl(
      activeWorkspaceId,
      runId,
      selectedItemId,
    );
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const logEvent: LogLine = JSON.parse(event.data);
        setLiveLines((prev) => [...prev, logEvent]);
      } catch {
        // ignore malformed events
      }
    };

    eventSource.addEventListener("done", () => {
      eventSource.close();
    });

    eventSource.onerror = () => {
      // SSE auto-reconnects; after persistent failure it will close
    };

    return () => {
      eventSource.close();
    };
  }, [activeWorkspaceId, runId, selectedItemId, isItemRunning]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop =
        logContainerRef.current.scrollHeight;
    }
  }, [liveLines, autoScroll, storedLogQuery.data]);

  // Build display lines
  const displayLines: LogLine[] = isItemRunning
    ? liveLines
    : storedLogQuery.data?.log
      ? parseStoredLog(storedLogQuery.data.log)
      : [];

  const filteredLines = displayLines.filter((line) => {
    const matchesSearch =
      !searchQuery ||
      line.line.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel =
      levelFilter === "all" || line.stream === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const handleCopy = useCallback(() => {
    const text = filteredLines.map((l) => l.line).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filteredLines]);

  const handleDownload = useCallback(() => {
    const text = filteredLines
      .map(
        (l) =>
          `[${new Date(l.ts).toISOString()}] [${l.stream}] ${l.line}`,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-${selectedItemId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLines, selectedItemId]);

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Left sidebar — test items list */}
      <div className="w-64 shrink-0 overflow-y-auto border rounded-lg bg-white">
        <div className="p-3 border-b">
          <h3 className="text-sm font-medium text-slate-700">
            Test Items
          </h3>
        </div>
        <div className="divide-y">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedItemId(item.id);
                setLiveLines([]);
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-slate-50",
                selectedItemId === item.id &&
                  "bg-emerald-50 border-l-2 border-emerald-500",
              )}
            >
              <div className="flex items-center gap-2">
                <StatusDot status={item.status} />
                <span className="truncate font-medium text-slate-800">
                  {item.testTitle ?? item.testId}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                >
                  {item.status}
                </Badge>
                {item.duration != null && (
                  <span className="text-[10px] text-slate-400">
                    {Math.round(item.duration / 1000)}s
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — console output */}
      <div className="flex-1 flex flex-col border rounded-lg bg-white overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-2 border-b bg-slate-50">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="stdout">stdout</SelectItem>
              <SelectItem value="stderr">stderr</SelectItem>
              <SelectItem value="system">system</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            <ArrowDown
              className={cn(
                "h-3.5 w-3.5 mr-1",
                autoScroll ? "text-emerald-600" : "text-slate-400",
              )}
            />
            <span className="text-xs">
              Auto-scroll
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {isItemRunning && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] animate-pulse">
              LIVE
            </Badge>
          )}
        </div>

        {/* Log content */}
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto font-mono text-xs leading-5 bg-slate-950 text-slate-200 p-3"
        >
          {!selectedItemId && (
            <div className="text-slate-500 text-center mt-20">
              Select a test item to view console output
            </div>
          )}

          {selectedItemId &&
            !isItemRunning &&
            storedLogQuery.isLoading && (
              <div className="text-slate-500 text-center mt-20">
                Loading logs...
              </div>
            )}

          {selectedItemId &&
            !isItemRunning &&
            !storedLogQuery.isLoading &&
            filteredLines.length === 0 && (
              <div className="text-slate-500 text-center mt-20">
                No console output available
              </div>
            )}

          {selectedItemId &&
            isItemRunning &&
            liveLines.length === 0 && (
              <div className="text-slate-500 text-center mt-20">
                <div className="inline-block h-3 w-3 rounded-full bg-emerald-500 animate-pulse mr-2" />
                Waiting for output...
              </div>
            )}

          {filteredLines.map((line, index) => (
            <div
              key={index}
              className={cn(
                "flex gap-3 py-px hover:bg-slate-900/50 px-1 rounded-sm",
                line.stream === "stderr" && "text-red-400",
                line.stream === "system" && "text-sky-400 italic",
              )}
            >
              <span className="text-slate-600 select-none shrink-0 w-20 text-right">
                {formatTimestamp(line.ts)}
              </span>
              <span
                className={cn(
                  "select-none shrink-0 w-12",
                  line.stream === "stderr"
                    ? "text-red-600"
                    : line.stream === "system"
                      ? "text-sky-600"
                      : "text-emerald-600",
                )}
              >
                {line.stream === "stdout"
                  ? "OUT"
                  : line.stream === "stderr"
                    ? "ERR"
                    : "SYS"}
              </span>
              <span className="whitespace-pre-wrap break-all">
                {searchQuery
                  ? highlightSearch(line.line, searchQuery)
                  : line.line}
              </span>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t bg-slate-50 text-[11px] text-slate-500">
          <span>
            {filteredLines.length} line{filteredLines.length !== 1 ? "s" : ""}
            {searchQuery && ` (filtered)`}
          </span>
          <span>
            {selectedItem?.testTitle ?? "No selection"} — {selectedItem?.status ?? ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const color =
    upper === "PASSED"
      ? "bg-green-500"
      : upper === "FAILED"
        ? "bg-red-500"
        : upper === "RUNNING"
          ? "bg-emerald-400 animate-pulse"
          : upper === "QUEUED"
            ? "bg-amber-400"
            : "bg-slate-400";
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", color)} />;
}

function formatTimestamp(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseStoredLog(raw: string): LogLine[] {
  const lines: LogLine[] = [];
  let currentStream: "stdout" | "stderr" | "system" = "stdout";

  for (const rawLine of raw.split("\n")) {
    if (rawLine.startsWith("[stdout]")) {
      currentStream = "stdout";
      continue;
    }
    if (rawLine.startsWith("[stderr]")) {
      currentStream = "stderr";
      continue;
    }
    if (rawLine.startsWith("[stack]")) {
      currentStream = "stderr";
      continue;
    }
    if (rawLine.startsWith("status=") || rawLine.startsWith("summary=")) {
      lines.push({ stream: "system", line: rawLine, ts: 0 });
      continue;
    }
    if (rawLine.trim()) {
      lines.push({ stream: currentStream, line: rawLine, ts: 0 });
    }
  }
  return lines;
}

function highlightSearch(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-400/40 text-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
