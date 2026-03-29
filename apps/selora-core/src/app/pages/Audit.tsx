import { useState, useMemo } from "react";
import { Search, Download, FileText, User, Settings, Shield } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { audit as auditApi } from "../../lib/api-client";
import { usePermissions } from "../../lib/auth-context";

export function Audit() {
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();

  const auditQuery = useQuery({
    queryKey: ["audit", activeWorkspaceId],
    queryFn: () => auditApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const auditEvents = auditQuery.data ?? [];

  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    for (const event of auditEvents) {
      if (event.eventType) types.add(event.eventType);
    }
    return Array.from(types).sort();
  }, [auditEvents]);

  const filteredEvents = auditEvents.filter(event => {
    const actorLabel = event.actor?.name ?? event.actor?.email ?? "";
    const matchesSearch = actorLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.eventType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = eventTypeFilter === "all" || event.eventType === eventTypeFilter;
    return matchesSearch && matchesType;
  });

  const getEventIcon = (type: string) => {
    if (type.includes("member") || type.includes("role")) return <User className="h-4 w-4 text-primary" />;
    if (type.includes("environment") || type.includes("suite") || type.includes("test")) return <Settings className="h-4 w-4 text-ai-accent" />;
    if (type.includes("run")) return <FileText className="h-4 w-4 text-success" />;
    return <Shield className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-1">Compliance</p>
          <h1 className="text-2xl font-semibold text-foreground">Audit Trail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enterprise-grade audit log for compliance and security monitoring
          </p>
        </div>
        {permissions.canManageCompany && (
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Audit Log
        </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Events</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{auditEvents.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Unique Actors</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {new Set(auditEvents.map(e => e.actorUserId)).size}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events, actors, or entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Event Types</SelectItem>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-lg border border-border bg-card max-h-[calc(100vh-280px)] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((event) => (
              <TableRow key={event.id} className="cursor-pointer hover:bg-surface-container-low" onClick={() => setSelectedEvent(event as unknown as Record<string, unknown>)}>
                <TableCell>
                  <div className="flex items-center justify-center">
                    {getEventIcon(event.eventType)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{event.eventType}</Badge>
                </TableCell>
                <TableCell className="font-medium text-foreground">{event.actor?.name ?? event.actor?.email ?? event.actorUserId}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">{event.entityType ?? ""}</p>
                    <p className="text-xs text-muted-foreground">{event.entityId ?? ""}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{event.createdAt}</TableCell>
                <TableCell>
                  {event.metadataJson && (
                    <div className="text-sm text-muted-foreground">
                      {Object.entries(event.metadataJson).slice(0, 2).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium">{key}:</span> {String(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedEvent(event as unknown as Record<string, unknown>); }}>View</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredEvents.length} of {auditEvents.length} events
      </p>

      {/* Event Detail Side Panel */}
      <Sheet open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Event Details
            </SheetTitle>
            <SheetDescription>
              {String(selectedEvent?.eventType ?? "Audit event")} at {String(selectedEvent?.createdAt ?? "")}
            </SheetDescription>
          </SheetHeader>
          {selectedEvent && (
            <div className="mt-6 space-y-6">
              {/* Actor Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Actor</h4>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{String((selectedEvent.actor as Record<string, unknown>)?.name ?? "Unknown")}</p>
                      <p className="text-xs text-muted-foreground">{String((selectedEvent.actor as Record<string, unknown>)?.email ?? selectedEvent.actorUserId ?? "")}</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Event Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Event</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Type</p>
                    <Badge variant="outline" className="mt-1">{String(selectedEvent.eventType)}</Badge>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Entity</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{String(selectedEvent.entityType ?? "—")}</p>
                  </Card>
                </div>
              </div>

              {/* Metadata / Payload */}
              {!!selectedEvent.metadataJson && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Payload</h4>
                  <Card className="p-4 bg-surface-container-low">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(selectedEvent.metadataJson, null, 2)}
                    </pre>
                  </Card>
                </div>
              )}

              {/* Entity ID */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Entity ID</h4>
                <code className="text-xs font-mono text-muted-foreground bg-surface-container-low px-2 py-1 rounded block break-all">
                  {String(selectedEvent.entityId ?? "—")}
                </code>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
