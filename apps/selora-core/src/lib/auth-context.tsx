// @refresh reset
import { createContext, useContext, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { auth as authApi, ApiError, type SessionData, type AuthUser, type AuthMembership, type PermissionFlags } from "./api-client";

const DEFAULT_PERMISSIONS: PermissionFlags = {
  isSeloraAdmin: false,
  canManageCompany: false,
  canManageMembers: false,
  canManageIntegrations: false,
  canManageEnvironments: false,
  canAuthorAutomation: false,
  canOperateRuns: false,
  isReadOnly: true,
};

type AuthContextValue = {
  user: AuthUser | null;
  memberships: AuthMembership[];
  permissions: PermissionFlags;
  activeWorkspace: SessionData["activeWorkspace"];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sessionQuery = useQuery<SessionData>({
    queryKey: ["session"],
    queryFn: () => authApi.getSession(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Redirect to login on 401
  useEffect(() => {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401) {
      navigate("/auth/login", { replace: true });
    }
  }, [sessionQuery.error, navigate]);

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["session"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.clear();
      navigate("/auth/login", { replace: true });
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const session = sessionQuery.data;
  const user = session?.user ?? null;
  const permissions = useMemo(() => session?.permissions ?? DEFAULT_PERMISSIONS, [session]);
  const activeWorkspace = session?.activeWorkspace ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships: user?.memberships ?? [],
        permissions,
        activeWorkspace,
        isLoading: sessionQuery.isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function usePermissions() {
  const { permissions } = useAuth();
  return permissions;
}
