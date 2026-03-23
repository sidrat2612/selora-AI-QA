import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Github, CheckCircle2, XCircle, Save, ShieldAlert } from "lucide-react";
import type { LicenseStatus } from "../../lib/api-client";

type GitHubIntegrationProps = {
  licenseStatus?: LicenseStatus | null;
};

export function GitHubIntegration({ licenseStatus }: GitHubIntegrationProps) {
  const [enabled, setEnabled] = useState(true);
  const [connected, setConnected] = useState(true);
  const [repository, setRepository] = useState("acme-corp/web-app");
  const [branch, setBranch] = useState("main");
  const [triggerOn, setTriggerOn] = useState("pull_request");
  const [reportStatus, setReportStatus] = useState(true);

  const isLicenseBlocked = Boolean(
    licenseStatus?.enforcementEnabled && !licenseStatus.commercialUseAllowed,
  );

  const handleConnect = () => {
    if (isLicenseBlocked) return;
    console.log("Connecting to GitHub...");
  };

  const handleSave = () => {
    if (isLicenseBlocked) return;
    console.log("Saving GitHub integration settings...");
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center">
              <Github className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">GitHub Integration</h3>
              <p className="text-sm text-muted-foreground">
                Run tests automatically on GitHub events
              </p>
            </div>
          </div>
          {connected ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              <XCircle className="mr-1 h-3 w-3" />
              Not Connected
            </Badge>
          )}
        </div>

        <div className="space-y-4">
          {isLicenseBlocked && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              <AlertTitle>Commercial license required</AlertTitle>
              <AlertDescription className="text-amber-800">
                GitHub integration is protected by your Selora license settings. Upgrade to a commercial license to enable repository sync, validation, and publication workflows.
              </AlertDescription>
            </Alert>
          )}

          {/* Enable Integration */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable GitHub integration</Label>
              <p className="text-sm text-muted-foreground">
                Trigger test runs based on GitHub events
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLicenseBlocked} />
          </div>

          {enabled && (
            <>
              {!connected ? (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-foreground mb-3">
                    Connect your GitHub account to enable this integration
                  </p>
                  <Button onClick={handleConnect}>
                    <Github className="mr-2 h-4 w-4" />
                    Connect GitHub
                  </Button>
                </div>
              ) : (
                <>
                  {/* Repository */}
                  <div className="space-y-2">
                    <Label htmlFor="repository">Repository</Label>
                    <Input
                      id="repository"
                      placeholder="owner/repository"
                      value={repository}
                      onChange={(e) => setRepository(e.target.value)}
                      disabled={isLicenseBlocked}
                    />
                  </div>

                  {/* Branch */}
                  <div className="space-y-2">
                    <Label htmlFor="branch">Default branch</Label>
                    <Input
                      id="branch"
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      disabled={isLicenseBlocked}
                    />
                  </div>

                  {/* Trigger Events */}
                  <div className="space-y-2">
                    <Label htmlFor="trigger">Trigger on</Label>
                    <Select value={triggerOn} onValueChange={setTriggerOn} disabled={isLicenseBlocked}>
                      <SelectTrigger id="trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pull_request">Pull requests</SelectItem>
                        <SelectItem value="push">Push to branch</SelectItem>
                        <SelectItem value="both">Pull requests & Push</SelectItem>
                        <SelectItem value="release">Releases</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Report Status */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Report status checks</Label>
                      <p className="text-sm text-muted-foreground">
                        Post test results as GitHub status checks
                      </p>
                    </div>
                    <Switch checked={reportStatus} onCheckedChange={setReportStatus} disabled={isLicenseBlocked} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {enabled && connected && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={isLicenseBlocked}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
