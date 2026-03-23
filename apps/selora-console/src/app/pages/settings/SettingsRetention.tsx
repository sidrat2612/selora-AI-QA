import { Save, AlertCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Alert, AlertDescription } from "../../components/ui/alert";

export function SettingsRetention() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Retention Policy</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure data retention windows for compliance and storage management
          </p>
        </div>
        <Button>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Retention policies help manage storage costs and meet compliance requirements. Data older than specified retention periods will be automatically deleted.
        </AlertDescription>
      </Alert>

      {/* Test Artifacts */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Test Artifacts</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure retention for screenshots, videos, and trace files
        </p>
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="screenshots">Screenshots Retention (days)</Label>
              <Input id="screenshots" type="number" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="videos">Videos Retention (days)</Label>
              <Input id="videos" type="number" defaultValue="30" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="traces">Trace Files Retention (days)</Label>
              <Input id="traces" type="number" defaultValue="90" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logs">Execution Logs Retention (days)</Label>
              <Input id="logs" type="number" defaultValue="90" />
            </div>
          </div>
        </div>
      </Card>

      {/* Run History */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Run History</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure retention for test run metadata and results
        </p>
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="passed-runs">Passed Runs (days)</Label>
              <Input id="passed-runs" type="number" defaultValue="180" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="failed-runs">Failed Runs (days)</Label>
              <Input id="failed-runs" type="number" defaultValue="365" />
            </div>
          </div>
        </div>
      </Card>

      {/* Audit Events */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Audit Events</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure retention for audit trail and compliance logs
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="audit">Audit Events Retention (days)</Label>
          <Input id="audit" type="number" defaultValue="730" />
          <p className="text-xs text-slate-500">
            Recommended: 2 years (730 days) for compliance requirements
          </p>
        </div>
      </Card>

      {/* Validation & Repair History */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Validation & Repair History</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure retention for AI validation and repair attempt history
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="validation">Validation History (days)</Label>
          <Input id="validation" type="number" defaultValue="90" />
        </div>
      </Card>
    </div>
  );
}
