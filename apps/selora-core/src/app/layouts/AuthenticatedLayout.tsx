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

  if (user && permissions.isSeloraAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Use Selora Console</h1>
          <p className="text-sm text-slate-600">
            Platform Administrators are restricted to the Selora Console. Core is reserved for company-facing admin, operator, and read-only workflows.
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
