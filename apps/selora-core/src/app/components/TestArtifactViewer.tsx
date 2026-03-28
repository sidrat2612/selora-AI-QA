import { useState } from "react";
import { Card } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Download, FileText, FileVideo, FileImage, Code } from "lucide-react";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { LogViewer } from "./LogViewer";

export interface Artifact {
  type: "screenshot" | "video" | "trace" | "log" | "code";
  name: string;
  size: string;
  url: string;
}

export interface Screenshot {
  id: string;
  url: string;
  step: string;
  timestamp: string;
  status: "pass" | "fail" | "info";
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "debug" | "warn" | "error";
  message: string;
  source: string;
}

interface TestArtifactViewerProps {
  testId: string;
  runId: string;
  screenshots?: Screenshot[];
  logs?: LogEntry[];
  artifacts?: Artifact[];
}

export function TestArtifactViewer({ testId, runId, screenshots = [], logs = [], artifacts = [] }: TestArtifactViewerProps) {
  const [activeTab, setActiveTab] = useState("screenshots");

  const handleArtifactDownload = (artifact: Artifact) => {
    if (!artifact.url || artifact.url === "#") return;
    const link = document.createElement("a");
    link.href = artifact.url;
    link.download = artifact.name;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          <TabsTrigger value="screenshots">Screenshots ({screenshots.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts ({artifacts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="screenshots" className="mt-6">
          <ScreenshotGallery screenshots={screenshots} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <LogViewer logs={logs} />
        </TabsContent>

        <TabsContent value="artifacts" className="mt-6">
          <Card className="p-6">
            <div className="space-y-4">
              {artifacts.map((artifact, index) => (
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
                  <Button variant="outline" size="sm" onClick={() => handleArtifactDownload(artifact)}>
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
