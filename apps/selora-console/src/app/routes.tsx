import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout";
import { Dashboard } from "./pages/Dashboard";
import { PlatformAdmin } from "./pages/PlatformAdmin";
import { TenantDetail } from "./pages/TenantDetail";
import { Audit } from "./pages/Audit";
import { SettingsLicense } from "./pages/settings/SettingsLicense";
import { SettingsLifecycle } from "./pages/settings/SettingsLifecycle";
import { SettingsQuotas } from "./pages/settings/SettingsQuotas";
import { SettingsRetention } from "./pages/settings/SettingsRetention";
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
          { path: "tenants", Component: PlatformAdmin },
          { path: "tenants/:id", Component: TenantDetail },
          { path: "audit", Component: Audit },
          { path: "usage", Component: SettingsQuotas },
          { path: "settings/license", Component: SettingsLicense },
          { path: "settings/lifecycle", Component: SettingsLifecycle },
          { path: "settings/retention", Component: SettingsRetention },
          { path: "settings/quotas", Component: SettingsQuotas },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);