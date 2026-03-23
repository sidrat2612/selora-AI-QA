import { Outlet } from "react-router";
import { AuthProvider } from "../../lib/auth-context";
import { WorkspaceProvider } from "../../lib/workspace-context";
import { useAuth, usePermissions } from "../../lib/auth-context";
import { LoadingState } from "../components/LoadingState";

function AuthGate() {
  const { isLoading, user } = useAuth();
  const permissions = usePermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading session..." />
      </div>
    );
  }

  // Console is restricted to Selora Admins (PLATFORM_ADMIN)
  if (user && !permissions.isSeloraAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Access Denied</h1>
          <p className="text-sm text-slate-600">
            The Selora Console is restricted to Platform Administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider>
      <Outlet />
    </WorkspaceProvider>
  );
}

export function AuthenticatedLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
