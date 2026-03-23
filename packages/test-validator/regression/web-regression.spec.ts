import { expect, test } from '@playwright/test';

const coreAppUrl = process.env['CORE_APP_URL'] ?? 'http://localhost:3000';
const consoleAppUrl = process.env['CONSOLE_APP_URL'] ?? 'http://localhost:3001';

type RoleCheck = {
  name: 'admin' | 'operator' | 'viewer' | 'platform-admin';
  email: string;
  password: string;
  canAuthorAutomation: boolean;
  canOperateRuns: boolean;
  canManageMembers: boolean;
  canManageCompany: boolean;
  canManageEnvironments: boolean;
  canAccessConsole: boolean;
  showsPlatformAdminNav: boolean;
};

const roles: RoleCheck[] = [
  {
    name: 'admin',
    email: process.env['REGRESSION_EMAIL'] ?? 'admin@selora.local',
    password: process.env['REGRESSION_PASSWORD'] ?? 'admin123',
    canAuthorAutomation: true,
    canOperateRuns: true,
    canManageMembers: true,
    canManageCompany: true,
    canManageEnvironments: true,
    canAccessConsole: false,
    showsPlatformAdminNav: false,
  },
  {
    name: 'operator',
    email: process.env['REGRESSION_OPERATOR_EMAIL'] ?? 'operator@selora.local',
    password: process.env['REGRESSION_OPERATOR_PASSWORD'] ?? 'operator123',
    canAuthorAutomation: true,
    canOperateRuns: true,
    canManageMembers: false,
    canManageCompany: false,
    canManageEnvironments: false,
    canAccessConsole: false,
    showsPlatformAdminNav: false,
  },
  {
    name: 'viewer',
    email: process.env['REGRESSION_VIEWER_EMAIL'] ?? 'viewer@selora.local',
    password: process.env['REGRESSION_VIEWER_PASSWORD'] ?? 'viewer123',
    canAuthorAutomation: false,
    canOperateRuns: false,
    canManageMembers: false,
    canManageCompany: false,
    canManageEnvironments: false,
    canAccessConsole: false,
    showsPlatformAdminNav: false,
  },
  {
    name: 'platform-admin',
    email: process.env['REGRESSION_PLATFORM_EMAIL'] ?? 'platform@selora.local',
    password: process.env['REGRESSION_PLATFORM_PASSWORD'] ?? 'platform123',
    canAuthorAutomation: true,
    canOperateRuns: true,
    canManageMembers: true,
    canManageCompany: true,
    canManageEnvironments: true,
    canAccessConsole: true,
    showsPlatformAdminNav: true,
  },
];

async function signIn(appUrl: string, email: string, password: string, page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${appUrl}/auth/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    try {
      await page.waitForURL((url) => !url.pathname.endsWith('/auth/login'), { timeout: 15_000 });
      return;
    } catch {
      const rateLimitVisible = await page
        .getByText(/Too Many Requests/i)
        .first()
        .isVisible({ timeout: 1_000 })
        .catch(() => false);

      if (rateLimitVisible && attempt === 0) {
        await page.waitForTimeout(61_000);
        continue;
      }

      throw new Error(`Sign in failed for ${email}.`);
    }
  }
}

async function expectVisibleByName(
  locator: import('@playwright/test').Locator,
  visible: boolean,
) {
  if (visible) {
    await expect(locator).toBeVisible();
    return;
  }

  await expect(locator).toHaveCount(0);
}

async function openCoreSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
}

async function openConsoleSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Platform Settings' }).click();
}

async function assertCoreAccess(page: import('@playwright/test').Page, role: RoleCheck) {
  await expect(page).not.toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

  await expectVisibleByName(
    page.getByRole('button', { name: 'Upload Recording' }),
    role.canAuthorAutomation,
  );
  await expectVisibleByName(
    page.getByRole('button', { name: 'Create Run' }),
    role.canOperateRuns,
  );

  const platformAdminLink = page.getByRole('link', { name: 'Platform Admin' });
  if (role.showsPlatformAdminNav) {
    await expect(platformAdminLink).toBeVisible();
    await platformAdminLink.click();
    await expect(page.getByRole('heading', { name: 'Platform Administration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Tenant' })).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  } else {
    await expect(platformAdminLink).toHaveCount(0);
  }

  await page.getByRole('link', { name: 'Tests' }).click();
  await expect(page.getByRole('heading', { name: 'Tests', exact: true })).toBeVisible();
  await expectVisibleByName(
    page.getByRole('button', { name: 'Upload Recording' }),
    role.canAuthorAutomation,
  );

  await page.getByRole('link', { name: 'Runs' }).click();
  await expect(page.getByRole('heading', { name: 'Test Runs' })).toBeVisible();
  await expectVisibleByName(
    page.getByRole('button', { name: 'Create Run' }),
    role.canOperateRuns,
  );

  await page.getByRole('link', { name: 'Audit' }).click();
  await expect(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible();
  await expectVisibleByName(
    page.getByRole('button', { name: 'Export Audit Log' }),
    role.canManageCompany,
  );

  const settingsTrigger = page.getByRole('button', { name: 'Settings' });
  const expectsSettings = role.canManageMembers || role.canAuthorAutomation || role.canManageCompany;
  if (!expectsSettings) {
    await expect(settingsTrigger).toHaveCount(0);
    return;
  }

  await expect(settingsTrigger).toBeVisible();
  await openCoreSettings(page);

  await expectVisibleByName(page.getByRole('menuitem', { name: 'Members' }), role.canManageMembers);
  await expectVisibleByName(page.getByRole('menuitem', { name: 'Execution' }), role.canAuthorAutomation || role.canManageCompany);
  await expectVisibleByName(page.getByRole('menuitem', { name: 'Lifecycle' }), role.canManageCompany);
  await expectVisibleByName(page.getByRole('menuitem', { name: 'Quotas' }), role.canManageCompany);
  await expectVisibleByName(page.getByRole('menuitem', { name: 'Retention' }), role.canManageCompany);
  await expectVisibleByName(page.getByRole('menuitem', { name: 'Environments' }), role.canManageEnvironments);

  if (role.canManageMembers) {
    await page.getByRole('menuitem', { name: 'Members' }).click();
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite Member' })).toBeVisible();
    return;
  }

  if (role.canAuthorAutomation || role.canManageCompany) {
    await page.getByRole('menuitem', { name: 'Execution' }).click();
    await expect(page.getByRole('heading', { name: 'Execution Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  }
}

async function assertConsoleAccess(page: import('@playwright/test').Page, role: RoleCheck) {
  if (role.canAccessConsole) {
    await page.goto(`${consoleAppUrl}/`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Platform Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tenants', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usage & Quotas', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Tenants', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Platform Administration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Tenant' })).toBeVisible();

    await page.getByRole('link', { name: 'Audit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Platform Audit Trail' })).toBeVisible();

    await page.getByRole('link', { name: 'Usage & Quotas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Quotas & Usage' })).toBeVisible();

    await openConsoleSettings(page);
    await expect(page.getByRole('menuitem', { name: 'License' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Lifecycle' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Retention' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Quotas' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'License' }).click();
    await expect(page.getByRole('heading', { name: 'License Management' })).toBeVisible();
    return;
  }

  await page.goto(`${consoleAppUrl}/tenants`, { waitUntil: 'networkidle' });
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