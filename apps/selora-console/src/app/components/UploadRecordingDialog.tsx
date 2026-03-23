import { useState, useRef } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Upload, FileVideo, X } from "lucide-react";
import { Progress } from "./ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { suites as suitesApi, recordings as recordingsApi } from "../../lib/api-client";
import { useWorkspace } from "../../lib/workspace-context";

interface UploadRecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadRecordingDialog({ open, onOpenChange }: UploadRecordingDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [testName, setTestName] = useState("");
  const [selectedSuite, setSelectedSuite] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: suiteList = [] } = useQuery({
    queryKey: ["suites", activeWorkspaceId],
    queryFn: () => suitesApi.list(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && open,
  });

  const uploadMutation = useMutation({
    mutationFn: () =>
      recordingsApi.upload(activeWorkspaceId!, selectedFile!, selectedSuite || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      onOpenChange(false);
      setSelectedFile(null);
      setTestName("");
      setSelectedSuite("");
      setUploading(false);
      setUploadProgress(0);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      // Auto-populate test name from filename
      if (!testName) {
        const name = e.target.files[0].name.replace(/\.[^/.]+$/, "");
        setTestName(name);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !testName || !selectedSuite) return;
    setUploading(true);
    setUploadProgress(50);
    uploadMutation.mutate(undefined, {
      onSettled: () => {
        setUploadProgress(100);
      },
    });
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Test Recording</DialogTitle>
          <DialogDescription>
            Upload a Playwright, Selenium, or Cypress recording to generate an AI-powered test
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Recording File</Label>
            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              >
                <FileVideo className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-slate-500">
                  Supports .webm, .mp4, .har, .zip files (max 100MB)
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileVideo className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".webm,.mp4,.har,.zip"
              onChange={handleFileSelect}
            />
          </div>

          {/* Test Name */}
          <div className="space-y-2">
            <Label htmlFor="test-name">Test Name</Label>
            <Input
              id="test-name"
              placeholder="e.g., Login flow validation"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              disabled={uploading}
            />
          </div>

          {/* Suite Selection */}
          <div className="space-y-2">
            <Label htmlFor="suite">Add to Suite</Label>
            <Select value={selectedSuite} onValueChange={setSelectedSuite} disabled={uploading}>
              <SelectTrigger id="suite">
                <SelectValue placeholder="Select a suite" />
              </SelectTrigger>
              <SelectContent>
                {suiteList.map((suite) => (
                  <SelectItem key={suite.id} value={suite.id}>
                    {suite.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="font-medium">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !testName || !selectedSuite || uploading}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Upload & Generate Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
