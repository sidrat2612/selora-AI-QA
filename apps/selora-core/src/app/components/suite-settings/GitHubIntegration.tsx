import { useState } from "react";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Github, CheckCircle2, XCircle, Save, RefreshCw, RotateCcw, GitBranch, ExternalLink } from "lucide-react";
import type { LicenseStatus } from "@selora/domain";
import { isCommercialFeatureBlocked } from "../../../lib/license";
import { CommercialLicenseAlert } from "./CommercialLicenseAlert";
import { useParams } from "react-router";
import { useWorkspace } from "../../../lib/workspace-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { githubIntegration as ghApi, type Publication } from "../../../lib/api-client";
import { toast } from "sonner";

type GitHubIntegrationProps = {
  licenseStatus?: LicenseStatus | null;
  integration?: {
    id: string;
    status: string;
    credentialMode: string;
    repoOwner?: string;
    repoName?: string;
    defaultBranch?: string;
    allowedWriteScope?: string;
    secretRotatedAt?: string | null;
  } | null;
};

export function GitHubIntegration({ licenseStatus, integration }: GitHubIntegrationProps) {
  const { id: suiteId } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const isLicenseBlocked = isCommercialFeatureBlocked(licenseStatus);

  const [repository, setRepository] = useState(
    integration ? `${integration.repoOwner}/${integration.repoName}` : ""
  );
  const [branch, setBranch] = useState(integration?.defaultBranch ?? "main");
  const [writeScope, setWriteScope] = useState(integration?.allowedWriteScope ?? "PULL_REQUESTS");
  const [rotateToken, setRotateToken] = useState("");

  const connected = integration?.status === "CONNECTED";

  const publicationsQuery = useQuery({
    queryKey: ["publications", activeWorkspaceId, suiteId],
    queryFn: () => ghApi.listPublications(activeWorkspaceId!, suiteId!),
    enabled: !!activeWorkspaceId && !!suiteId && connected,
  });

  const validateMutation = useMutation({
    mutationFn: () => ghApi.validate(activeWorkspaceId!, suiteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("GitHub integration re-validated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Validation failed."),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const [owner, repo] = repository.split("/");
      return ghApi.upsert(activeWorkspaceId!, suiteId!, {
        repoOwner: owner,
        repoName: repo,
        defaultBranch: branch,
        allowedWriteScope: writeScope,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      toast.success("GitHub settings saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  const rotateMutation = useMutation({
    mutationFn: () => ghApi.rotateSecret(activeWorkspaceId!, suiteId!, { newToken: rotateToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", activeWorkspaceId, suiteId] });
      setRotateToken("");
      toast.success("Secret rotated successfully.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rotation failed."),
  });

  const replayMutation = useMutation({
    mutationFn: (deliveryId: string) => ghApi.replayDelivery(activeWorkspaceId!, suiteId!, deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications", activeWorkspaceId, suiteId] });
      toast.success("Delivery replayed.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Replay failed."),
  });

  const publications: Publication[] = publicationsQuery.data ?? [];

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
              <p className="text-sm text-muted-foreground">Publish artifacts and manage webhooks</p>
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
              {integration ? "Invalid" : "Not Connected"}
            </Badge>
          )}
        </div>

        {isLicenseBlocked && (
          <CommercialLicenseAlert>
            GitHub integration requires a commercial Selora license.
          </CommercialLicenseAlert>
        )}

        {connected && (
          <>
            {/* Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repository">Repository</Label>
                <Input id="repository" placeholder="owner/repository" value={repository} onChange={(e) => setRepository(e.target.value)} disabled={isLicenseBlocked} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Default branch</Label>
                <Input id="branch" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} disabled={isLicenseBlocked} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="write-scope">Write scope</Label>
                <Select value={writeScope} onValueChange={setWriteScope} disabled={isLicenseBlocked}>
                  <SelectTrigger id="write-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READ_ONLY">Read only</SelectItem>
                    <SelectItem value="BRANCH_PUSH">Branch push</SelectItem>
                    <SelectItem value="PULL_REQUESTS">Pull requests</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={isLicenseBlocked || saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {saveMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {validateMutation.isPending ? "Validating..." : "Re-validate"}
                </Button>
              </div>
            </div>

            {/* Secret Rotation */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Secret Rotation</h4>
              {integration?.secretRotatedAt && (
                <p className="text-xs text-muted-foreground">Last rotated: {new Date(integration.secretRotatedAt).toLocaleString()}</p>
              )}
              <div className="flex gap-2">
                <Input type="password" placeholder="New PAT token" value={rotateToken} onChange={(e) => setRotateToken(e.target.value)} className="flex-1" />
                <Button variant="outline" onClick={() => rotateMutation.mutate()} disabled={!rotateToken || rotateMutation.isPending}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {rotateMutation.isPending ? "Rotating..." : "Rotate"}
                </Button>
              </div>
            </div>

            {/* Publication Status Cards */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Recent Publications ({publications.length})</h4>
              {publications.length === 0 && (
                <p className="text-sm text-muted-foreground">No publications yet.</p>
              )}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {publications.map((pub) => (
                  <PublicationCard key={pub.id} publication={pub} onReplay={(id) => replayMutation.mutate(id)} replayPending={replayMutation.isPending} />
                ))}
              </div>
            </div>
          </>
        )}

        {!connected && !isLicenseBlocked && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-foreground mb-3">
              {integration ? "Integration is disconnected or invalid. Re-validate to reconnect." : "Connect a GitHub repository to enable artifact publication."}
            </p>
            {integration && (
              <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-validate
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function PublicationCard({ publication, onReplay, replayPending }: { publication: Publication; onReplay: (id: string) => void; replayPending: boolean }) {
  const statusColors: Record<string, string> = {
    PUBLISHED: "bg-blue-50 text-blue-700 border-blue-200",
    MERGED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
    SUPERSEDED: "bg-slate-50 text-slate-600 border-slate-200",
  };

  const failedDeliveries = (publication.webhookDeliveries ?? []).filter((d) => d.status === "FAILED");

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-800">{publication.branchName}</span>
        </div>
        <Badge className={statusColors[publication.status] ?? "bg-slate-50 text-slate-600"}>
          {publication.status}
        </Badge>
      </div>
      <p className="text-xs text-slate-500">{publication.targetPath}</p>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {publication.pullRequestUrl && (
          <a href={publication.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
            PR #{publication.pullRequestNumber} <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {publication.publishedAt && <span>Published: {new Date(publication.publishedAt).toLocaleDateString()}</span>}
        {publication.headCommitSha && <span className="font-mono">{publication.headCommitSha.slice(0, 7)}</span>}
      </div>
      {publication.lastError && (
        <p className="text-xs text-red-600 bg-red-50 rounded p-2">{publication.lastError}</p>
      )}
      {failedDeliveries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-red-600">{failedDeliveries.length} failed delivery(ies)</p>
          {failedDeliveries.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{d.eventName}{d.action ? `.${d.action}` : ""} — {d.lastError ?? "Unknown error"}</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onReplay(d.id)} disabled={replayPending}>
                <RotateCcw className="mr-1 h-3 w-3" />
                Replay
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
