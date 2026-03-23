import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Save } from "lucide-react";

export function ExecutionPolicy() {
  const [enableRetries, setEnableRetries] = useState(true);
  const [maxRetries, setMaxRetries] = useState("3");
  const [timeout, setTimeout] = useState("30");
  const [parallelism, setParallelism] = useState("4");
  const [failFast, setFailFast] = useState(false);

  const handleSave = () => {
    console.log("Saving execution policy...");
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Execution Policy</h3>
          <p className="text-sm text-muted-foreground">
            Configure retry behavior, timeouts, and execution settings for this suite
          </p>
        </div>

        <div className="space-y-4">
          {/* Retry Settings */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable automatic retries</Label>
              <p className="text-sm text-muted-foreground">
                Automatically retry failed tests
              </p>
            </div>
            <Switch checked={enableRetries} onCheckedChange={setEnableRetries} />
          </div>

          {enableRetries && (
            <div className="space-y-2">
              <Label htmlFor="max-retries">Maximum retry attempts</Label>
              <Input
                id="max-retries"
                type="number"
                min="1"
                max="10"
                value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)}
              />
            </div>
          )}

          {/* Timeout */}
          <div className="space-y-2">
            <Label htmlFor="timeout">Test timeout (seconds)</Label>
            <Input
              id="timeout"
              type="number"
              min="5"
              max="300"
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum time allowed for a single test to complete
            </p>
          </div>

          {/* Parallelism */}
          <div className="space-y-2">
            <Label htmlFor="parallelism">Parallel execution workers</Label>
            <Select value={parallelism} onValueChange={setParallelism}>
              <SelectTrigger id="parallelism">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 worker (sequential)</SelectItem>
                <SelectItem value="2">2 workers</SelectItem>
                <SelectItem value="4">4 workers</SelectItem>
                <SelectItem value="8">8 workers</SelectItem>
                <SelectItem value="16">16 workers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fail Fast */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Fail fast</Label>
              <p className="text-sm text-muted-foreground">
                Stop execution immediately when a test fails
              </p>
            </div>
            <Switch checked={failFast} onCheckedChange={setFailFast} />
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
