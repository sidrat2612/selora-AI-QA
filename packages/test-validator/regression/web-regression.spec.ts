import { expect, test } from '@playwright/test';

const coreAppUrl = process.env['CORE_APP_URL'] ?? 'http://localhost:3001';
const consoleAppUrl = process.env['CONSOLE_APP_URL'] ?? 'http://localhost:3002';

type RoleCheck = {
  name: 'admin' | 'operator' | 'viewer' | 'platform-admin';
  email: string;
  password: string;
  canManageWorkspace: boolean;
  canAccessConsole: boolean;
  showsPlatformAdminNav: boolean;
};

const roles: RoleCheck[] = [
  {
    name: 'admin',
    email: process.env['REGRESSION_EMAIL'] ?? 'admin@selora.local',
    password: process.env['REGRESSION_PASSWORD'] ?? 'admin123',
    canManageWorkspace: true,
    canAccessConsole: false,
    showsPlatformAdminNav: false,
  },
  {
    name: 'operator',
    email: process.env['REGRESSION_OPERATOR_EMAIL'] ?? 'operator@selora.local',
    password: process.env['REGRESSION_OPERATOR_PASSWORD'] ?? 'operator123',
    canManageWorkspace: true,
    canAccessConsole: false,
    showsPlatformAdminNav: false,
  },
  {
    name: 'viewer',
    email: process.env['REGRESSION_VIEWER_EMAIL'] ?? 'viewer@selora.local',
    password: process.env['REGRESSION_VIEWER_PASSWORD'] ?? 'viewer123',
    canManageWorkspace: false,
    canAccessConsole: false,
    showsPlatformAdminNav: false,
  },
  {
    name: 'platform-admin',
    email: process.env['REGRESSION_PLATFORM_EMAIL'] ?? 'platform@selora.local',
    password: process.env['REGRESSION_PLATFORM_PASSWORD'] ?? 'platform123',
    canManageWorkspace: true,
    canAccessConsole: true,
    showsPlatformAdminNav: true,
  },
];

async function signIn(appUrl: string, email: string, password: string, page: import('@playwright/test').Page) {
  await page.goto(`${appUrl}/auth/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/auth/login'), { timeout: 15_000 });
}

async function assertCoreAccess(page: import('@playwright/test').Page, role: RoleCheck) {
  await expect(page).not.toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('link', { name: 'Tests' })).toBeVisible();

  const platformAdminLink = page.getByRole('link', { name: 'Platform Admin' });
  if (role.showsPlatformAdminNav) {
    await expect(platformAdminLink).toBeVisible();
  } else {
    await expect(platformAdminLink).toHaveCount(0);
  }

  await page.getByRole('link', { name: 'Tests' }).click();
  await expect(page.getByRole('heading', { name: 'Tests', exact: true })).toBeVisible();

  const uploadRecordingButton = page.getByRole('button', { name: 'Upload Recording' });
  if (role.canManageWorkspace) {
    await expect(uploadRecordingButton.first()).toBeVisible();
  } else {
    await expect(uploadRecordingButton).toHaveCount(0);
  }
}

async function assertConsoleAccess(page: import('@playwright/test').Page, role: RoleCheck) {
  await page.goto(`${consoleAppUrl}/`, { waitUntil: 'networkidle' });

  if (role.canAccessConsole) {
    await expect(page.getByRole('heading', { name: 'Platform Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tenants', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usage & Quotas', exact: true })).toBeVisible();
    return;
  }

  await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
  await expect(page.getByText('The Selora Console is restricted to Platform Administrators.')).toBeVisible();
}

test.describe('cross-app web regression', () => {
  for (const role of roles) {
    test(`${role.name} access across core and console`, async ({ page }) => {
      await signIn(coreAppUrl, role.email, role.password, page);
      await assertCoreAccess(page, role);
      await assertConsoleAccess(page, role);
    });
  }
});