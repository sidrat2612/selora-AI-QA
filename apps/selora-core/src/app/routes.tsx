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
          { path: "suites", lazy: () => loadRoute(() => import("./pages/Suites"), "Suites") },
          { path: "suites/:id", lazy: () => loadRoute(() => import("./pages/SuiteDetail"), "SuiteDetail") },
          { path: "suites/:suiteId/test-cases/:testCaseId", lazy: () => loadRoute(() => import("./pages/TestCaseDetail"), "TestCaseDetail") },
          { path: "tests", lazy: () => loadRoute(() => import("./pages/Tests"), "Tests") },
          { path: "tests/:id", lazy: () => loadRoute(() => import("./pages/TestDetail"), "TestDetail") },
          { path: "runs", lazy: () => loadRoute(() => import("./pages/Runs"), "Runs") },
          { path: "runs/:id", lazy: () => loadRoute(() => import("./pages/RunDetail"), "RunDetail") },
          { path: "feedback", lazy: () => loadRoute(() => import("./pages/Feedback"), "Feedback") },
          { path: "audit", lazy: () => loadRoute(() => import("./pages/Audit"), "Audit") },
          { path: "settings/integrations", lazy: () => loadRoute(() => import("./pages/Integrations"), "Integrations") },
          { path: "account/profile", lazy: () => loadRoute(() => import("./pages/AccountProfile"), "AccountProfile") },
          { path: "account/preferences", lazy: () => loadRoute(() => import("./pages/AccountPreferences"), "AccountPreferences") },
          { path: "settings/members", lazy: () => loadRoute(() => import("./pages/settings/SettingsMembers"), "SettingsMembers") },
          { path: "settings/execution", lazy: () => loadRoute(() => import("./pages/settings/SettingsExecution"), "SettingsExecution") },
          { path: "settings/lifecycle", lazy: () => loadRoute(() => import("./pages/settings/SettingsLifecycle"), "SettingsLifecycle") },
          { path: "settings/quotas", lazy: () => loadRoute(() => import("./pages/settings/SettingsQuotas"), "SettingsQuotas") },
          { path: "settings/retention", lazy: () => loadRoute(() => import("./pages/settings/SettingsRetention"), "SettingsRetention") },
          { path: "settings/environments", lazy: () => loadRoute(() => import("./pages/settings/SettingsEnvironments"), "SettingsEnvironments") },
          { path: "settings/ai", lazy: () => loadRoute(() => import("./pages/settings/SettingsAI"), "SettingsAI") },
          { path: "*", lazy: () => loadRoute(() => import("./pages/NotFound"), "NotFound") },
        ],
      },
    ],
  },
]);