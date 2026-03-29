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
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../../lib/workspace-context";
import { usePermissions } from "../../../lib/auth-context";
import { type Membership, workspaces as workspacesApi } from "../../../lib/api-client";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "TENANT_VIEWER", label: "Tenant Viewer" },
  { value: "TENANT_OPERATOR", label: "Tenant Operator" },
  { value: "TENANT_ADMIN", label: "Tenant Admin" },
] as const;

function formatRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function SettingsMembers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("TENANT_VIEWER");
  const [selectedMember, setSelectedMember] = useState<Membership | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("TENANT_VIEWER");
  const { activeWorkspaceId } = useWorkspace();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["memberships", activeWorkspaceId],
    queryFn: () => workspacesApi.listMemberships(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const members = membersQuery.data ?? [];

  const invalidateMembers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["memberships", activeWorkspaceId] });
  };

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.createMembership(activeWorkspaceId, {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
      });
    },
    onSuccess: async () => {
      await invalidateMembers();
      toast.success("Member invited.");
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("TENANT_VIEWER");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to invite member.";
      toast.error(message);
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !selectedMember) throw new Error("No member selected.");
      return workspacesApi.updateMembership(activeWorkspaceId, selectedMember.id, { role: selectedRole });
    },
    onSuccess: async () => {
      await invalidateMembers();
      toast.success("Member role updated.");
      setChangeRoleOpen(false);
      setSelectedMember(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update member role.";
      toast.error(message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !selectedMember) throw new Error("No member selected.");
      return workspacesApi.deleteMembership(activeWorkspaceId, selectedMember.id);
    },
    onSuccess: async () => {
      await invalidateMembers();
      toast.success("Member removed.");
      setRemoveOpen(false);
      setSelectedMember(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to remove member.";
      toast.error(message);
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!activeWorkspaceId) throw new Error("No workspace selected.");
      return workspacesApi.resendMembershipInvite(activeWorkspaceId, membershipId);
    },
    onSuccess: () => {
      toast.success("Invitation resent.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to resend invite.";
      toast.error(message);
    },
  });

  const filteredMembers = members.filter(member =>
    (member.user?.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (member.user?.email ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeColor = (role: string) => {
    switch (role.toUpperCase()) {
      case "PLATFORM_ADMIN":
      case "TENANT_ADMIN":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "TENANT_OPERATOR":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "TENANT_VIEWER":
        return "bg-muted text-foreground border-border";
      default:
        return "bg-muted text-foreground border-border";
    }
  };

  const handleInvite = () => {
    if (!inviteName.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!inviteEmail.trim()) {
      toast.error("Email is required.");
      return;
    }
    inviteMutation.mutate();
  };

  const openChangeRoleDialog = (member: Membership) => {
    setSelectedMember(member);
    setSelectedRole(member.role);
    setChangeRoleOpen(true);
  };

  const openRemoveDialog = (member: Membership) => {
    setSelectedMember(member);
    setRemoveOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage workspace members and their access permissions
          </p>
        </div>
        {permissions.canManageMembers && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join this workspace.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Colleague Name"
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    disabled={inviteMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    disabled={inviteMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteMutation.isPending}>Cancel</Button>
                <Button onClick={handleInvite} disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Dialog open={changeRoleOpen} onOpenChange={setChangeRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the member role for {selectedMember?.user?.email ?? "the selected member"}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="change-role">Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="change-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoleOpen(false)} disabled={changeRoleMutation.isPending}>Cancel</Button>
            <Button onClick={() => changeRoleMutation.mutate()} disabled={changeRoleMutation.isPending || !selectedMember}>
              {changeRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {selectedMember?.user?.email ?? "the selected member"} from the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending || !selectedMember}>
              {removeMutation.isPending ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Members</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{members.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {members.filter(m => m.status.toUpperCase() === "ACTIVE").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Pending Invites</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {members.filter(m => m.status.toUpperCase() === "INVITED").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Admins</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {members.filter(m => m.role.toUpperCase().includes("ADMIN")).length}
          </p>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-white max-h-[calc(100vh-280px)] overflow-y-auto">
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
                      <p className="font-medium text-foreground">{member.user?.name ?? "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">{member.user?.email ?? ""}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getRoleBadgeColor(member.role)}>
                    {formatRole(member.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.status.toUpperCase() === "ACTIVE" ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      {member.status}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {permissions.canManageMembers && (
                        <DropdownMenuItem onClick={() => openChangeRoleDialog(member)}>Change Role</DropdownMenuItem>
                      )}
                      {member.status.toUpperCase() === "INVITED" && (
                        <DropdownMenuItem onClick={() => resendInviteMutation.mutate(member.id)}>
                          <Mail className="mr-2 h-4 w-4" />
                          Resend Invite
                        </DropdownMenuItem>
                      )}
                      {permissions.canManageMembers && (
                        <DropdownMenuItem onClick={() => openRemoveDialog(member)} className="text-red-600">Remove Member</DropdownMenuItem>
                      )}
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
