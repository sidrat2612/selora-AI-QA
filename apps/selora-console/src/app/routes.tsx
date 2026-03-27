import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout";

async function loadRoute<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule,
) {
  const module = await loader();
  return { Component: module[exportName] as ComponentType };
}

export const router = createBrowserRouter([
  // Auth routes (no layout, no session required)
  {
    path: "/auth/login",
    lazy: () => loadRoute(() => import("./pages/auth/Login"), "Login"),
  },
  {
    path: "/auth/forgot-password",
    lazy: () => loadRoute(() => import("./pages/auth/ForgotPassword"), "ForgotPassword"),
  },
  {
    path: "/auth/reset-password",
    lazy: () => loadRoute(() => import("./pages/auth/ResetPassword"), "ResetPassword"),
  },
  {
    path: "/auth/verify-email",
    lazy: () => loadRoute(() => import("./pages/auth/VerifyEmail"), "VerifyEmail"),
  },
  // Authenticated routes
  {
    Component: AuthenticatedLayout,
    children: [
      {
        path: "/",
        Component: AppLayout,
        children: [
          { index: true, lazy: () => loadRoute(() => import("./pages/Dashboard"), "Dashboard") },
          { path: "tenants", lazy: () => loadRoute(() => import("./pages/PlatformAdmin"), "PlatformAdmin") },
          { path: "tenants/:id", lazy: () => loadRoute(() => import("./pages/TenantDetail"), "TenantDetail") },
          { path: "audit", lazy: () => loadRoute(() => import("./pages/Audit"), "Audit") },
          { path: "settings/integrations", lazy: () => loadRoute(() => import("./pages/Integrations"), "Integrations") },
          { path: "account/profile", lazy: () => loadRoute(() => import("./pages/AccountProfile"), "AccountProfile") },
          { path: "usage", lazy: () => loadRoute(() => import("./pages/settings/SettingsQuotas"), "SettingsQuotas") },
          { path: "settings/lifecycle", lazy: () => loadRoute(() => import("./pages/settings/SettingsLifecycle"), "SettingsLifecycle") },
          { path: "settings/quotas", lazy: () => loadRoute(() => import("./pages/settings/SettingsQuotas"), "SettingsQuotas") },
          { path: "settings/ai", lazy: () => loadRoute(() => import("./pages/settings/SettingsAI"), "SettingsAI") },
          { path: "*", lazy: () => loadRoute(() => import("./pages/NotFound"), "NotFound") },
        ],
      },
    ],
  },
]);