import { Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { usePermissions } from "../../../lib/auth-context";

export function SettingsExecution() {
  const permissions = usePermissions();
  const canEdit = permissions.canManageCompany || permissions.canAuthorAutomation;
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Execution Settings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure default execution policies, retry rules, and AI validation behavior
          </p>
        </div>
        {canEdit && (
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        )}
      </div>

      {/* Retry Policy */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Retry Policy</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure automatic retry behavior for failed tests
        </p>
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-retries">Maximum Retries</Label>
              <Input id="max-retries" type="number" defaultValue="3" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry-delay">Retry Delay (seconds)</Label>
              <Input id="retry-delay" type="number" defaultValue="2" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Automatic Retries</Label>
              <p className="text-xs text-slate-500">Retry failed tests automatically</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </Card>

      {/* Timeout Settings */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Timeout Settings</h3>
        <p className="mt-1 text-sm text-slate-600">
          Set default timeout values for test execution
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="test-timeout">Test Timeout (seconds)</Label>
            <Input id="test-timeout" type="number" defaultValue="30" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-timeout">Action Timeout (seconds)</Label>
            <Input id="action-timeout" type="number" defaultValue="10" />
          </div>
        </div>
      </Card>

      {/* AI Validation & Repair */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">AI Validation & Repair</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configure bounded AI assistance for test validation and repair
        </p>
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Auto-Repair</Label>
              <p className="text-xs text-slate-500">Allow AI to automatically fix detected issues</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-repair-attempts">Maximum Repair Attempts</Label>
            <Input id="max-repair-attempts" type="number" defaultValue="3" />
            <p className="text-xs text-slate-500">
              Bounded limit prevents infinite repair loops
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confidence-threshold">Confidence Threshold (%)</Label>
            <Input id="confidence-threshold" type="number" defaultValue="80" />
            <p className="text-xs text-slate-500">
              Minimum confidence required for automatic repairs
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Human Review for Low Confidence</Label>
              <p className="text-xs text-slate-500">Flag repairs below threshold for manual review</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </Card>

      {/* Parallel Execution */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Parallel Execution</h3>
        <p className="mt-1 text-sm text-slate-600">
          Control concurrent test execution
        </p>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workers">Number of Workers</Label>
            <Select defaultValue="5">
              <SelectTrigger id="workers">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 (Sequential)</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5 (Default)</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
}
