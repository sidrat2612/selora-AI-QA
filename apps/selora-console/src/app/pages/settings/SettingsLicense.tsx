import { AlertTriangle, CheckCircle2, KeyRound, Mail, Shield, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { license as licenseApi } from "../../../lib/api-client";

export function SettingsLicense() {
  const { data: licenseStatus } = useQuery({
    queryKey: ["license-status"],
    queryFn: () => licenseApi.getStatus(),
  });

  const protectedFeatures = licenseStatus?.protectedFeatures ?? [];
  const commercialUnlocked = Boolean(licenseStatus?.commercialUseAllowed);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">License Management</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review the active Selora license tier, protected features, and deployment configuration requirements
        </p>
      </div>

      {!commercialUnlocked && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertTitle>Premium features are currently restricted</AlertTitle>
          <AlertDescription className="text-amber-800">
            This instance is running in evaluation mode. Premium features remain blocked until a commercial license is configured on the server.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Tier</p>
          <p className="mt-1 text-2xl font-semibold capitalize text-slate-900">
            {licenseStatus?.tier ?? "evaluation"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Commercial Access</p>
          <div className="mt-2 flex items-center gap-2">
            {commercialUnlocked ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-600" />
            )}
            <p className="text-lg font-semibold text-slate-900">
              {commercialUnlocked ? "Unlocked" : "Blocked"}
            </p>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Licensed To</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {licenseStatus?.licensedTo ?? "Not configured"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Alert Email</p>
          <div className="mt-2 flex items-center gap-2">
            <Mail className={`h-5 w-5 ${licenseStatus?.alertEmailConfigured ? "text-emerald-600" : "text-slate-400"}`} />
            <p className="text-lg font-semibold text-slate-900">
              {licenseStatus?.alertEmailConfigured ? "Configured" : "Not set"}
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Protected Features</h3>
            <p className="text-sm text-slate-600">
              These capabilities are gated by the backend license guard when enforcement is enabled
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {protectedFeatures.map((feature) => (
            <Badge key={feature} variant="outline" className="border-slate-300 text-slate-700">
              {feature}
            </Badge>
          ))}
          {protectedFeatures.length === 0 && (
            <p className="text-sm text-slate-500">No protected features reported by the server.</p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Server Configuration</h3>
            <p className="text-sm text-slate-600">
              License state is currently managed by backend environment configuration
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">Required variables for commercial unlock</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>LICENSE_ENFORCEMENT=true</p>
              <p>LICENSE_TIER=commercial</p>
              <p>LICENSE_KEY=&lt;commercial key&gt;</p>
              <p>LICENSED_TO=&lt;customer or company&gt;</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">Recommended compliance configuration</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>LICENSE_ALERT_EMAIL=&lt;owner email&gt;</p>
              <p>Enable SMTP delivery in production</p>
              <p>Restart the API after license changes</p>
              <p>Use the commercial tier only for approved deployments</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}