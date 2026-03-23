import { useState } from "react";
import { Search, MoreHorizontal, Mail, UserPlus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../../lib/workspace-context";
import { workspaces as workspacesApi } from "../../../lib/api-client";

export function SettingsMembers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const { activeWorkspaceId } = useWorkspace();

  const membersQuery = useQuery({
    queryKey: ["memberships", activeWorkspaceId],
    queryFn: () => workspacesApi.listMemberships(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const members = membersQuery.data ?? [];

  const filteredMembers = members.filter(member =>
    (member.user?.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (member.user?.email ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "Platform Admin":
      case "Tenant Admin":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "Tenant Operator":
      case "Workspace Operator":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Tenant Viewer":
      case "Workspace Viewer":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Members</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage workspace members and their access permissions
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join this workspace
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="colleague@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select defaultValue="viewer">
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_viewer">Tenant Viewer</SelectItem>
                    <SelectItem value="tenant_operator">Tenant Operator</SelectItem>
                    <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={() => setInviteOpen(false)}>Send Invitation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Total Members</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{members.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Active</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {members.filter(m => m.status === "active").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Pending Invites</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {members.filter(m => m.status === "invited").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Admins</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {members.filter(m => m.role.includes("Admin")).length}
          </p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Members Table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-medium text-emerald-700">
                      {(member.user?.name ?? "?").split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{member.user?.name ?? "Unknown"}</p>
                      <p className="text-sm text-slate-600">{member.user?.email ?? ""}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getRoleBadgeColor(member.role)}>
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.status === "active" ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      {member.status}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-slate-600">—</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Change Role</DropdownMenuItem>
                      {member.status === "invited" && (
                        <DropdownMenuItem>
                          <Mail className="mr-2 h-4 w-4" />
                          Resend Invite
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-red-600">Remove Member</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
