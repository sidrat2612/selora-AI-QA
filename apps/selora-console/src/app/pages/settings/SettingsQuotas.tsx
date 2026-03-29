import { AlertTriangle } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { quotas as quotasApi } from "../../../lib/api-client";
import { useWorkspace } from "../../../lib/workspace-context";

export function SettingsQuotas() {
  const { activeTenantId } = useWorkspace();

  const { data: quotaData } = useQuery({
    queryKey: ["quotas", activeTenantId],
    queryFn: () => quotasApi.get(activeTenantId!),
    enabled: !!activeTenantId,
  });

  // Build displayable quota entries from the API response
  const quotaEntries = Object.entries(quotaData ?? {})
    .filter(([, v]) => v && typeof v === "object" && "used" in (v as Record<string, unknown>) && "limit" in (v as Record<string, unknown>))
    .map(([key, v]) => {
      const val = v as { used: number; limit: number; unit?: string };
      return { name: key, used: val.used, limit: val.limit, unit: val.unit ?? "" };
    });
  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-destructive";
    if (percentage >= 75) return "bg-warning";
    return "bg-primary";
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Quotas & Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor resource usage and quota limits for your workspace
          </p>
        </div>
      </div>

      {/* Alert */}
      {quotaEntries.some((q) => q.used / q.limit >= 0.85) && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Warning:</strong> One or more quotas approaching capacity. Consider upgrading your plan.
          </AlertDescription>
        </Alert>
      )}

      {/* Quota Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {quotaEntries.map((quota) => {
          const percentage = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;

          return (
            <Card key={quota.name} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{quota.name}</h3>

                  <div className="mt-6">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-3xl font-semibold text-foreground">
                          {quota.used}
                        </span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          of {quota.limit} {quota.unit}
                        </span>
                      </div>
                      <span className={`text-sm font-medium ${
                        percentage >= 90 ? "text-destructive" : percentage >= 75 ? "text-warning" : "text-muted-foreground"
                      }`}>
                        {percentage.toFixed(1)}%
                      </span>
                    </div>

                    <div className="mt-3">
                      <Progress value={percentage} className="h-2" />
                    </div>
                  </div>

                  {percentage >= 75 && (
                    <div className="mt-4 rounded-lg bg-amber-50 p-3">
                      <p className="text-sm text-amber-800">
                        {percentage >= 90 ? "Critical: " : "Warning: "}
                        Approaching quota limit
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Usage Details */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground">Usage Thresholds</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual indicators help you monitor resource consumption
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Normal (0-74%)</p>
              <p className="text-xs text-muted-foreground">Healthy usage levels</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">Warning (75-89%)</p>
              <p className="text-xs text-muted-foreground">Monitor closely</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-destructive" />
            <div>
              <p className="text-sm font-medium text-foreground">Critical (90-100%)</p>
              <p className="text-xs text-muted-foreground">Action required</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
