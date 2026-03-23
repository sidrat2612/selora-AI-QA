import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { CheckCircle2, XCircle, Save, ShieldAlert, TestTube2 } from "lucide-react";
import type { LicenseStatus } from "../../lib/api-client";

type TestRailIntegrationProps = {
  licenseStatus?: LicenseStatus | null;
};

export function TestRailIntegration({ licenseStatus }: TestRailIntegrationProps) {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [createRuns, setCreateRuns] = useState(true);
  const [updateCases, setUpdateCases] = useState(true);

  const isLicenseBlocked = Boolean(
    licenseStatus?.enforcementEnabled && !licenseStatus.commercialUseAllowed,
  );

  const handleConnect = () => {
    if (isLicenseBlocked) return;
    console.log("Connecting to TestRail...");
  };

  const handleSave = () => {
    if (isLicenseBlocked) return;
    console.log("Saving TestRail integration settings...");
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <TestTube2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">TestRail Integration</h3>
              <p className="text-sm text-muted-foreground">
                Sync test results with TestRail
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
                TestRail integration is only available with a commercial Selora license. Enable a commercial license to sync suites, validate connections, and publish run results.
              </AlertDescription>
            </Alert>
          )}

          {/* Enable Integration */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable TestRail integration</Label>
              <p className="text-sm text-muted-foreground">
                Sync test execution results to TestRail
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLicenseBlocked} />
          </div>

          {enabled && (
            <>
              {!connected ? (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-foreground mb-3">
                    Connect to TestRail to enable result synchronization
                  </p>
                  <Button onClick={handleConnect}>
                    <TestTube2 className="mr-2 h-4 w-4" />
                    Connect TestRail
                  </Button>
                </div>
              ) : (
                <>
                  {/* Project ID */}
                  <div className="space-y-2">
                    <Label htmlFor="project-id">Project ID</Label>
                    <Input
                      id="project-id"
                      placeholder="e.g., P123"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={isLicenseBlocked}
                    />
                  </div>

                  {/* Suite ID */}
                  <div className="space-y-2">
                    <Label htmlFor="suite-id">Suite ID</Label>
                    <Input
                      id="suite-id"
                      placeholder="e.g., S456"
                      value={suiteId}
                      onChange={(e) => setSuiteId(e.target.value)}
                      disabled={isLicenseBlocked}
                    />
                  </div>

                  {/* Create Test Runs */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Create test runs automatically</Label>
                      <p className="text-sm text-muted-foreground">
                        Create a new TestRail run for each execution
                      </p>
                    </div>
                    <Switch checked={createRuns} onCheckedChange={setCreateRuns} disabled={isLicenseBlocked} />
                  </div>

                  {/* Update Test Cases */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Update test case results</Label>
                      <p className="text-sm text-muted-foreground">
                        Update individual test case results in TestRail
                      </p>
                    </div>
                    <Switch checked={updateCases} onCheckedChange={setUpdateCases} disabled={isLicenseBlocked} />
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
