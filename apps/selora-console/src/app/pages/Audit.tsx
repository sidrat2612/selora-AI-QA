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
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth-context";
import { audit as auditApi, type AuditEvent } from "../../lib/api-client";

export function Audit() {
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const { memberships } = useAuth();

  // Collect unique workspace IDs from all memberships
  const workspaceIds = useMemo(() => {
    const ids = new Set(memberships.map(m => m.workspaceId).filter(Boolean));
    return Array.from(ids) as string[];
  }, [memberships]);

  // Fetch audit events from all workspaces and merge
  const auditQuery = useQuery({
    queryKey: ["platform-audit", workspaceIds],
    queryFn: async () => {
      const results = await Promise.all(
        workspaceIds.map(wsId => auditApi.list(wsId).catch(() => [] as AuditEvent[]))
      );
      return results.flat().sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
    enabled: workspaceIds.length > 0,
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
          <h1 className="text-2xl font-semibold text-foreground">Platform Audit Trail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-tenant audit log for platform compliance and security monitoring
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Audit Log
        </Button>
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
              <TableRow key={event.id}>
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
                  <Button variant="ghost" size="sm">View</Button>
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
    </div>
  );
}
