import { useState } from "react";
import { Clock, Save } from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../../lib/workspace-context";
import { suites as suitesApi, workspaces as workspacesApi, type Environment } from "../../../lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

type ScheduleConfigProps = {
  suiteId: string;
  schedule: {
    enabled: boolean;
    cron: string | null;
    environmentId: string | null;
    timezone: string;
  } | null;
};

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 6 AM", value: "0 6 * * *" },
  { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
  { label: "Weekly (Sun midnight)", value: "0 0 * * 0" },
];

export function ScheduleConfig({ suiteId, schedule }: ScheduleConfigProps) {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [cron, setCron] = useState(schedule?.cron ?? "0 0 * * *");
  const [environmentId, setEnvironmentId] = useState(schedule?.environmentId ?? "");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "UTC");

  const environmentsQuery = useQuery({
    queryKey: ["environments", activeWorkspaceId],
    queryFn: () => workspacesApi.listEnvironments(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  });

  const environments = environmentsQuery.data ?? [];

  const saveMutation = useMutation({
    mutationFn: () =>
      suitesApi.update(activeWorkspaceId!, suiteId, {
        scheduleEnabled: enabled,
        scheduleCron: enabled ? cron : null,
        scheduleEnvironmentId: enabled ? environmentId || null : null,
        scheduleTimezone: timezone,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("Schedule settings saved.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save schedule.");
    },
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-900">Scheduled Runs</h4>
        </div>
        <Badge variant={enabled ? "default" : "outline"}>
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="schedule-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <Label htmlFor="schedule-enabled" className="text-sm">Enable automatic scheduled runs</Label>
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="schedule-cron" className="text-sm">Cron Expression</Label>
              <Input
                id="schedule-cron"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 0 * * *"
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap gap-1">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setCron(preset.value)}
                    className="inline-flex items-center rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-env" className="text-sm">Environment</Label>
              <select
                id="schedule-env"
                value={environmentId}
                onChange={(e) => setEnvironmentId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Select environment...</option>
                {environments.map((env: Environment) => (
                  <option key={env.id} value={env.id}>
                    {env.name} ({env.baseUrl})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-tz" className="text-sm">Timezone</Label>
              <Input
                id="schedule-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
              />
            </div>
          </>
        )}

        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save className="mr-2 h-3 w-3" />
          {saveMutation.isPending ? "Saving..." : "Save Schedule"}
        </Button>
      </div>
    </Card>
  );
}
