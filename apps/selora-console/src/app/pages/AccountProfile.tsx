import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Building2, Mail, Save, ShieldCheck, User2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../../lib/auth-context";
import { account as accountApi } from "../../lib/api-client";

export function AccountProfile() {
  const { user, memberships } = useAuth();
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

  const tenantCount = new Set(memberships.map((membership) => membership.tenantId)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
            Review and update the active platform administrator identity and organization access.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Administrator Account</CardTitle>
            <CardDescription>Account details are persisted through the backend account API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="console-account-name">Full Name</Label>
                <Input
                  id="console-account-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="console-account-avatar">Avatar URL</Label>
                <Input
                  id="console-account-avatar"
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
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <User2 className="h-4 w-4 text-emerald-600" />
                    Full Name
                  </div>
                  <p className="text-base font-semibold text-foreground">{profileQuery.data?.name ?? user?.name ?? "Unknown user"}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <Mail className="h-4 w-4 text-emerald-600" />
                    Email Address
                  </div>
                  <p className="text-base font-semibold text-foreground">{profileQuery.data?.email ?? user?.email ?? "No email available"}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    Tenant Access
                  </div>
                  <p className="text-base font-semibold text-foreground">{tenantCount}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Memberships
                  </div>
                  <p className="text-base font-semibold text-foreground">{memberships.length}</p>
                </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification Status</CardTitle>
            <CardDescription>Authentication state for the signed-in platform admin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Email Verification</p>
                <p className="text-sm text-muted-foreground">
                  {profileQuery.data?.emailVerifiedAt ?? user?.emailVerifiedAt ? "Verified for admin notifications and recovery." : "Pending verification."}
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
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Account Status</p>
                <p className="text-sm text-muted-foreground">Lifecycle state returned by the console session.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
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