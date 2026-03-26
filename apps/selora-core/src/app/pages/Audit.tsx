import { useState } from "react";
import { Search, Filter, Download, FileText, User, Settings, Shield } from "lucide-react";
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
import { useWorkspace } from "../../lib/workspace-context";
import { audit as auditApi } from "../../lib/api-client";
import { usePermissions } from "../../lib/auth-context";

export function Audit() {
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();

  const auditQuery = useQuery({
    queryKey: ["audit", activeWorkspaceId],
    queryFn: () => auditApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const auditEvents = auditQuery.data ?? [];

  const filteredEvents = auditEvents.filter(event => {
    const actorLabel = event.actor?.name ?? event.actor?.email ?? "";
    const matchesSearch = actorLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.eventType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = eventTypeFilter === "all" || event.eventType === eventTypeFilter;
    return matchesSearch && matchesType;
  });

  const getEventIcon = (type: string) => {
    if (type.includes("member") || type.includes("role")) return <User className="h-4 w-4 text-blue-600" />;
    if (type.includes("environment") || type.includes("suite") || type.includes("test")) return <Settings className="h-4 w-4 text-purple-600" />;
    if (type.includes("run")) return <FileText className="h-4 w-4 text-green-600" />;
    return <Shield className="h-4 w-4 text-slate-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit Trail</h1>
          <p className="mt-1 text-sm text-slate-600">
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
          <p className="text-sm text-slate-600">Total Events</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{auditEvents.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Unique Actors</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {new Set(auditEvents.map(e => e.actorUserId)).size}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
              <SelectItem value="Test Created">Test Created</SelectItem>
              <SelectItem value="Run Executed">Run Executed</SelectItem>
              <SelectItem value="Member Invited">Member Invited</SelectItem>
              <SelectItem value="Environment Updated">Environment Updated</SelectItem>
              <SelectItem value="Suite Modified">Suite Modified</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
          </Button>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-lg border border-slate-200 bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
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
                <TableCell className="font-medium text-slate-900">{event.actor?.name ?? event.actor?.email ?? event.actorUserId}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-900">{event.entityType ?? ""}</p>
                    <p className="text-xs text-slate-500">{event.entityId ?? ""}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600">{event.createdAt}</TableCell>
                <TableCell>
                  {event.metadataJson && (
                    <div className="text-sm text-slate-600">
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Showing {filteredEvents.length} of {auditEvents.length} events
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
