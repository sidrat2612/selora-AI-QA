import { useState } from "react";
import { Card } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Download, FileText, FileVideo, FileImage, Code } from "lucide-react";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { LogViewer } from "./LogViewer";

interface Artifact {
  type: "screenshot" | "video" | "trace" | "log" | "code";
  name: string;
  size: string;
  url: string;
}

interface TestArtifactViewerProps {
  testId: string;
  runId: string;
}

const mockScreenshots = [
  { id: "1", url: "", step: "Login page loaded", timestamp: "00:00.123", status: "pass" as const },
  { id: "2", url: "", step: "Email input filled", timestamp: "00:01.456", status: "pass" as const },
  { id: "3", url: "", step: "Password input filled", timestamp: "00:02.789", status: "pass" as const },
  { id: "4", url: "", step: "Submit button clicked", timestamp: "00:03.012", status: "pass" as const },
  { id: "5", url: "", step: "Dashboard loaded", timestamp: "00:04.345", status: "pass" as const },
];

const mockLogs = [
  { timestamp: "14:32:01.123", level: "info" as const, message: "Starting test execution", source: "runner" },
  { timestamp: "14:32:01.234", level: "info" as const, message: "Navigating to https://app.example.com/login", source: "browser" },
  { timestamp: "14:32:02.456", level: "debug" as const, message: "Element found: [data-testid='email-input']", source: "locator" },
  { timestamp: "14:32:03.789", level: "info" as const, message: "Filled email input", source: "action" },
  { timestamp: "14:32:04.012", level: "debug" as const, message: "Element found: [data-testid='password-input']", source: "locator" },
  { timestamp: "14:32:05.234", level: "info" as const, message: "Filled password input", source: "action" },
  { timestamp: "14:32:06.456", level: "info" as const, message: "Clicked submit button", source: "action" },
  { timestamp: "14:32:07.789", level: "info" as const, message: "Navigation completed", source: "browser" },
  { timestamp: "14:32:08.012", level: "info" as const, message: "Test completed successfully", source: "runner" },
];

const mockArtifacts: Artifact[] = [
  { type: "video", name: "test-recording.webm", size: "2.4 MB", url: "#" },
  { type: "trace", name: "playwright-trace.zip", size: "1.8 MB", url: "#" },
  { type: "log", name: "execution.log", size: "45 KB", url: "#" },
  { type: "code", name: "test-snapshot.js", size: "12 KB", url: "#" },
];

export function TestArtifactViewer({ testId, runId }: TestArtifactViewerProps) {
  const [activeTab, setActiveTab] = useState("screenshots");

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case "video":
        return <FileVideo className="h-4 w-4" />;
      case "screenshot":
        return <FileImage className="h-4 w-4" />;
      case "trace":
        return <FileText className="h-4 w-4" />;
      case "code":
        return <Code className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="screenshots">Screenshots ({mockScreenshots.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts ({mockArtifacts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="screenshots" className="mt-6">
          <ScreenshotGallery screenshots={mockScreenshots} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <LogViewer logs={mockLogs} />
        </TabsContent>

        <TabsContent value="artifacts" className="mt-6">
          <Card className="p-6">
            <div className="space-y-4">
              {mockArtifacts.map((artifact, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                      {getArtifactIcon(artifact.type)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{artifact.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {artifact.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{artifact.size}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
