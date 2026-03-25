import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LayoutGrid, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { account as accountApi } from "../../lib/api-client";

type PreferencesState = {
  compactNavigation: boolean;
  emailNotifications: boolean;
  runDigest: boolean;
  autoOpenFailures: boolean;
};

const defaultPreferences: PreferencesState = {
  compactNavigation: false,
  emailNotifications: true,
  runDigest: true,
  autoOpenFailures: true,
};

export function AccountPreferences() {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<PreferencesState>(defaultPreferences);
  const preferencesQuery = useQuery({
    queryKey: ["account-preferences"],
    queryFn: () => accountApi.getPreferences(),
  });

  const savePreferencesMutation = useMutation({
    mutationFn: () => accountApi.updatePreferences(preferences),
    onSuccess: async (data) => {
      setPreferences(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
      toast.success("Preferences saved.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save preferences.");
    },
  });

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferences(preferencesQuery.data);
  }, [preferencesQuery.data]);

  const updatePreference = (key: keyof PreferencesState, value: boolean) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    savePreferencesMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Preferences</h1>
          <p className="mt-1 text-sm text-slate-600">
            Control how Selora behaves for this browser session and workstation.
          </p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Preferences
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-emerald-600" />
              Workspace Experience
            </CardTitle>
            <CardDescription>Adjust navigation and failure triage defaults.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-1">
                <Label htmlFor="compact-navigation">Compact sidebar navigation</Label>
                <p className="text-sm text-slate-600">Keep the navigation tighter when switching between suites and runs.</p>
              </div>
              <Switch
                id="compact-navigation"
                checked={preferences.compactNavigation}
                onCheckedChange={(checked) => updatePreference("compactNavigation", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-1">
                <Label htmlFor="auto-open-failures">Auto-open failed artifacts</Label>
                <p className="text-sm text-slate-600">Jump directly into screenshots and logs when a run fails.</p>
              </div>
              <Switch
                id="auto-open-failures"
                checked={preferences.autoOpenFailures}
                onCheckedChange={(checked) => updatePreference("autoOpenFailures", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-emerald-600" />
              Notifications
            </CardTitle>
            <CardDescription>Choose which updates matter on this device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-1">
                <Label htmlFor="email-notifications">Email notifications</Label>
                <p className="text-sm text-slate-600">Receive account and execution updates by email.</p>
              </div>
              <Switch
                id="email-notifications"
                checked={preferences.emailNotifications}
                onCheckedChange={(checked) => updatePreference("emailNotifications", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-1">
                <Label htmlFor="run-digest">Daily run digest</Label>
                <p className="text-sm text-slate-600">Get a compact summary of run health and quota changes.</p>
              </div>
              <Switch
                id="run-digest"
                checked={preferences.runDigest}
                onCheckedChange={(checked) => updatePreference("runDigest", checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-900">
            <Sparkles className="h-5 w-5" />
            Preference Storage
          </CardTitle>
          <CardDescription className="text-emerald-800">
            These preferences are stored on the user record in the backend, so they follow the account instead of staying tied to one browser.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}