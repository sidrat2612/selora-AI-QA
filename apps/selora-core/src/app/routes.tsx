import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout";
import { Dashboard } from "./pages/Dashboard";
import { Suites } from "./pages/Suites";
import { SuiteDetail } from "./pages/SuiteDetail";
import { Tests } from "./pages/Tests";
import { TestDetail } from "./pages/TestDetail";
import { Runs } from "./pages/Runs";
import { RunDetail } from "./pages/RunDetail";
import { Feedback } from "./pages/Feedback";
import { Audit } from "./pages/Audit";
import { SettingsMembers } from "./pages/settings/SettingsMembers";
import { SettingsExecution } from "./pages/settings/SettingsExecution";
import { SettingsLifecycle } from "./pages/settings/SettingsLifecycle";
import { SettingsQuotas } from "./pages/settings/SettingsQuotas";
import { SettingsRetention } from "./pages/settings/SettingsRetention";
import { SettingsEnvironments } from "./pages/settings/SettingsEnvironments";
import { PlatformAdmin } from "./pages/PlatformAdmin";
import { TenantDetail } from "./pages/TenantDetail";
import { Login } from "./pages/auth/Login";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  // Auth routes (no layout, no session required)
  {
    path: "/auth/login",
    Component: Login,
  },
  {
    path: "/auth/forgot-password",
    Component: ForgotPassword,
  },
  {
    path: "/auth/reset-password",
    Component: ResetPassword,
  },
  {
    path: "/auth/verify-email",
    Component: VerifyEmail,
  },
  // Authenticated routes
  {
    Component: AuthenticatedLayout,
    children: [
      {
        path: "/",
        Component: AppLayout,
        children: [
          { index: true, Component: Dashboard },
          { path: "suites", Component: Suites },
          { path: "suites/:id", Component: SuiteDetail },
          { path: "tests", Component: Tests },
          { path: "tests/:id", Component: TestDetail },
          { path: "runs", Component: Runs },
          { path: "runs/:id", Component: RunDetail },
          { path: "feedback", Component: Feedback },
          { path: "audit", Component: Audit },
          { path: "settings/members", Component: SettingsMembers },
          { path: "settings/execution", Component: SettingsExecution },
          { path: "settings/lifecycle", Component: SettingsLifecycle },
          { path: "settings/quotas", Component: SettingsQuotas },
          { path: "settings/retention", Component: SettingsRetention },
          { path: "settings/environments", Component: SettingsEnvironments },
          { path: "platform-admin", Component: PlatformAdmin },
          { path: "platform-admin/tenants/:id", Component: TenantDetail },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);