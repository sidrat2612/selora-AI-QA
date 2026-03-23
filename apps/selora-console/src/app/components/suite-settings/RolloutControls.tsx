import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Save, Zap } from "lucide-react";

export function RolloutControls() {
  const [enableGradual, setEnableGradual] = useState(false);
  const [rolloutPercentage, setRolloutPercentage] = useState([50]);
  const [rolloutStrategy, setRolloutStrategy] = useState("percentage");
  const [canaryEnabled, setCanaryEnabled] = useState(false);

  const handleSave = () => {
    console.log("Saving rollout controls...");
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Rollout Controls</h3>
          <p className="text-sm text-muted-foreground">
            Manage gradual test rollout and canary deployment strategies
          </p>
        </div>

        <div className="space-y-4">
          {/* Gradual Rollout */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable gradual rollout</Label>
              <p className="text-sm text-muted-foreground">
                Roll out test updates gradually to minimize risk
              </p>
            </div>
            <Switch checked={enableGradual} onCheckedChange={setEnableGradual} />
          </div>

          {enableGradual && (
            <>
              {/* Rollout Strategy */}
              <div className="space-y-2">
                <Label htmlFor="strategy">Rollout strategy</Label>
                <Select value={rolloutStrategy} onValueChange={setRolloutStrategy}>
                  <SelectTrigger id="strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage-based</SelectItem>
                    <SelectItem value="environment">Environment-based</SelectItem>
                    <SelectItem value="manual">Manual approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {rolloutStrategy === "percentage" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Rollout percentage</Label>
                    <Badge variant="secondary">{rolloutPercentage[0]}%</Badge>
                  </div>
                  <Slider
                    value={rolloutPercentage}
                    onValueChange={setRolloutPercentage}
                    min={0}
                    max={100}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tests will be rolled out to {rolloutPercentage[0]}% of environments
                  </p>
                </div>
              )}

              {rolloutStrategy === "environment" && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-foreground mb-2">Environment order:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal">
                    <li>Development</li>
                    <li>Staging</li>
                    <li>Production</li>
                  </ol>
                </div>
              )}
            </>
          )}

          {/* Canary Testing */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <div className="space-y-0.5">
                  <Label>Canary testing</Label>
                  <p className="text-sm text-muted-foreground">
                    Run new test versions on a small subset first
                  </p>
                </div>
              </div>
              <Switch checked={canaryEnabled} onCheckedChange={setCanaryEnabled} />
            </div>

            {canaryEnabled && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-900">
                  <strong>Canary mode active:</strong> New test versions will run on 10% of traffic before full rollout
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </Card>
  );
}
