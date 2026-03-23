import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import type { AuthMembership } from "./api-client";

type WorkspaceContextValue = {
  activeWorkspaceId: string | null;
  activeTenantId: string | null;
  activeMembership: AuthMembership | null;
  workspaceMemberships: AuthMembership[];
  setActiveWorkspaceId: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { memberships, activeWorkspace } = useAuth();
  const [overrideId, setOverrideId] = useState<string | null>(null);

  // Only memberships that have a workspace assigned
  const workspaceMemberships = useMemo(
    () => memberships.filter((m) => m.workspaceId !== null),
    [memberships],
  );

  // Use server-provided activeWorkspace, allow local override, fall back to first
  const resolvedId = overrideId
    ?? activeWorkspace?.id
    ?? workspaceMemberships[0]?.workspaceId
    ?? null;

  const activeMembership = useMemo(
    () => workspaceMemberships.find((m) => m.workspaceId === resolvedId) ?? null,
    [workspaceMemberships, resolvedId],
  );

  const activeTenantId = activeWorkspace?.tenantId
    ?? activeMembership?.tenantId
    ?? memberships[0]?.tenantId
    ?? null;

  const setActiveWorkspaceId = useCallback((id: string) => {
    setOverrideId(id);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspaceId: resolvedId,
        activeTenantId,
        activeMembership,
        workspaceMemberships,
        setActiveWorkspaceId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
