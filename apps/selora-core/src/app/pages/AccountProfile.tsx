import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Mail, Save, ShieldCheck, User2, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Link } from "react-router";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { account as accountApi } from "../../lib/api-client";

export function AccountProfile() {
  const { user } = useAuth();
  const { activeWorkspaceId, workspaceMemberships } = useWorkspace();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["account-profile"],
    queryFn: () => accountApi.getProfile(),
  });
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (!profileQuery.data) return;
    setName(profileQuery.data.name);
    setAvatarUrl(profileQuery.data.avatarUrl ?? "");
  }, [profileQuery.data]);

  const saveProfileMutation = useMutation({
    mutationFn: () => accountApi.updateProfile({ name: name.trim(), avatarUrl: avatarUrl.trim() || null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
      toast.success("Profile updated.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update profile.");
    },
  });

  const activeMembership = workspaceMemberships.find((membership) => membership.workspaceId === activeWorkspaceId);
  const roleLabel = activeMembership?.role
    ?.replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase()) ?? "Member";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Profile Settings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review and update the active account, workspace role, and authentication status.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/account/preferences">Open Preferences</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Account Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account-name">Full Name</Label>
                <Input
                  id="account-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-avatar">Avatar URL</Label>
                <Input
                  id="account-avatar"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending || !name.trim()}>
                <Save className="mr-2 h-4 w-4" />
                {saveProfileMutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <User2 className="h-4 w-4 text-emerald-600" />
                Full Name
              </div>
              <p className="text-base font-semibold text-slate-900">{profileQuery.data?.name ?? user?.name ?? "Unknown user"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Mail className="h-4 w-4 text-emerald-600" />
                Email Address
              </div>
              <p className="text-base font-semibold text-slate-900">{profileQuery.data?.email ?? user?.email ?? "No email available"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Active Role
              </div>
              <p className="text-base font-semibold text-slate-900">{roleLabel}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Users className="h-4 w-4 text-emerald-600" />
                Workspace Memberships
              </div>
              <p className="text-base font-semibold text-slate-900">{profileQuery.data?.memberships.length ?? user?.memberships.length ?? 0}</p>
            </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification Status</CardTitle>
            <CardDescription>Authentication and account state for the signed-in user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Email Verification</p>
                <p className="text-sm text-slate-600">
                  {profileQuery.data?.emailVerifiedAt ?? user?.emailVerifiedAt ? "Verified for password recovery and security alerts." : "Pending verification."}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  (profileQuery.data?.emailVerifiedAt ?? user?.emailVerifiedAt)
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {profileQuery.data?.emailVerifiedAt ?? user?.emailVerifiedAt ? "Verified" : "Pending"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Account Status</p>
                <p className="text-sm text-slate-600">Current user lifecycle status returned by the API.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                {profileQuery.data?.status ?? user?.status ?? "Unknown"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}