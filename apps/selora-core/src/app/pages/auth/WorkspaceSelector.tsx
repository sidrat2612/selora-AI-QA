import { Link, useNavigate } from "react-router";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Database, ChevronRight, Plus, Building2 } from "lucide-react";
import { useAuth } from "../../../lib/auth-context";
import { useWorkspace } from "../../../lib/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { workspaces as workspacesApi, type Workspace } from "../../../lib/api-client";
import { useMemo } from "react";

export function WorkspaceSelector() {
  const navigate = useNavigate();
  const { memberships, user } = useAuth();
  const { setActiveWorkspaceId } = useWorkspace();

  const workspaceIds = useMemo(() => {
    const ids = new Set(memberships.map((m) => m.workspaceId).filter(Boolean));
    return Array.from(ids) as string[];
  }, [memberships]);

  const { data: workspaces = [] } = useQuery({
    queryKey: ["user-workspaces", workspaceIds],
    queryFn: async () => {
      const results = await Promise.all(
        workspaceIds.map((id) => workspacesApi.getDetails(id).catch(() => null)),
      );
      return results.filter(Boolean) as Workspace[];
    },
    enabled: workspaceIds.length > 0,
  });

  const handleSelect = (workspace: Workspace) => {
    setActiveWorkspaceId(workspace.id);
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-2">
            Workspace
          </p>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Select a workspace to continue
          </p>
        </div>

        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} className="overflow-hidden">
              <button
                onClick={() => handleSelect(workspace)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{workspace.name}</p>
                  <p className="text-xs text-muted-foreground">{workspace.slug}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </Card>
          ))}

          {workspaces.length === 0 && (
            <Card className="p-8 text-center">
              <Database className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                You don't have access to any workspaces yet.
              </p>
              <Link to="/auth/login">
                <Button variant="outline">Back to login</Button>
              </Link>
            </Card>
          )}
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Plus className="mr-2 h-4 w-4" />
            Create new workspace
          </Button>
        </div>
      </div>
    </div>
  );
}
