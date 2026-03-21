/**
 * Sprint 6 – Multi-tenant isolation tests
 *
 * Creates a second tenant + workspace + user at test time and verifies
 * that a user from tenant A cannot read resources belonging to tenant B.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Redis = require('ioredis');
const { PrismaClient, MembershipRole, MembershipStatus } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createApp } = require('../dist/bootstrap');

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, '../../..');
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';

let app;
let baseUrl;

/* ── helpers ───────────────────────────────────────────────── */

async function startApp() {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine API test server address.');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopApp() {
  if (app) {
    await app.close();
    app = undefined;
    baseUrl = undefined;
  }
}

function seedDatabase() {
  execFileSync('pnpm', ['db:seed'], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

async function resetState() {
  await stopApp();
  seedDatabase();
  await prisma.auditEvent.deleteMany();
  await prisma.tenantQuota.deleteMany();
  await prisma.tenant.updateMany({
    data: {
      status: 'ACTIVE',
      suspendedAt: null,
      archivedAt: null,
      softDeleteRequestedAt: null,
      softDeleteScheduledFor: null,
    },
  });
  await prisma.environment.updateMany({
    data: {
      baseUrl: 'http://localhost:3000',
      secretRef: 'env/dev/default',
      encryptedSecretJson: null,
      isDefault: true,
      status: 'ACTIVE',
      testTimeoutMs: 120000,
      runTimeoutMs: 3600000,
      maxRetries: 0,
    },
  });
  await prisma.workspace.updateMany({
    data: {
      status: 'ACTIVE',
      maxTestsPerRun: 25,
      runCooldownSeconds: 0,
    },
  });
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const parsed = new URL(redisUrl);
    const client = new Redis({
      host: parsed.hostname,
      port: Number(parsed.port || '6379'),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
    });
    await client.flushdb();
    await client.quit();
  }
  await startApp();
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

async function login(email, password) {
  const { response, body } = await requestJson('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 201, `Login failed for ${email}: ${JSON.stringify(body)}`);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Expected login response to set a session cookie.');
  return cookie.split(';', 1)[0];
}

/* ── second-tenant fixture ─────────────────────────────────── */

const SECOND_TENANT_PASSWORD = 'isolation-test-pass-99';
let secondTenantId;
let secondWorkspaceId;

async function createSecondTenant() {
  // Clean up any leftover data from a previous run
  await prisma.auditEvent.deleteMany({ where: { tenantId: 'isolation-tenant' } });
  await prisma.membership.deleteMany({ where: { tenantId: 'isolation-tenant' } });
  await prisma.user.deleteMany({ where: { email: 'isolation-admin@selora.local' } });
  await prisma.workspace.deleteMany({ where: { id: 'isolation-workspace' } });
  await prisma.tenant.deleteMany({ where: { id: 'isolation-tenant' } });

  const tenant = await prisma.tenant.create({
    data: {
      id: 'isolation-tenant',
      slug: 'isolation-tenant',
      name: 'Isolation Tenant',
      status: 'ACTIVE',
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      id: 'isolation-workspace',
      tenantId: tenant.id,
      slug: 'isolation-workspace',
      name: 'Isolation WS',
      status: 'ACTIVE',
    },
  });

  const passwordHash = await bcrypt.hash(SECOND_TENANT_PASSWORD, 12);

  await prisma.user.create({
    data: {
      email: 'isolation-admin@selora.local',
      name: 'Isolation Admin',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          role: MembershipRole.TENANT_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      },
    },
  });

  secondTenantId = tenant.id;
  secondWorkspaceId = workspace.id;

  // seed an audit event in the isolation workspace
  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      eventType: 'test.isolation_seed',
      entityType: 'workspace',
      entityId: workspace.id,
    },
  });
}

/* ── lifecycle ─────────────────────────────────────────────── */

test.before(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? '1025';
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? 'noreply@selora.local';
  process.env.API_SESSION_SECRET =
    process.env.API_SESSION_SECRET ?? 'dev-session-secret-change-in-prod';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  await resetState();
  await createSecondTenant();
});

test.after(async () => {
  await stopApp();
  await prisma.$disconnect();
});

/* ── tests ────────────────────────────────────────────────── */

test('operator from tenant A cannot access workspace in tenant B', async () => {
  // operator@selora.local belongs to dev-tenant / default-workspace
  const operatorCookie = await login('operator@selora.local', 'operator123');

  // Attempt to list memberships for the isolation-workspace (tenant B)
  const { response, body } = await requestJson(
    `/api/v1/workspaces/${secondWorkspaceId}/memberships`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(response.status, 403, `Expected 403 but got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error.code, 'WORKSPACE_ACCESS_DENIED');
});

test('admin from tenant A cannot list workspaces for tenant B', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');

  const { response, body } = await requestJson(
    `/api/v1/tenants/${secondTenantId}/workspaces`,
    {
      headers: { cookie: adminCookie },
    },
  );

  assert.equal(response.status, 403, `Expected 403 but got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error.code, 'TENANT_ACCESS_DENIED');
});

test('admin from tenant A cannot read audit events in tenant B workspace', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${secondWorkspaceId}/audit-events`,
    {
      headers: { cookie: adminCookie },
    },
  );

  assert.equal(response.status, 403, `Expected 403 but got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error.code, 'WORKSPACE_ACCESS_DENIED');
});

test('admin from tenant A cannot read usage in tenant B', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');

  const { response, body } = await requestJson(
    `/api/v1/tenants/${secondTenantId}/usage`,
    {
      headers: { cookie: adminCookie },
    },
  );

  assert.equal(response.status, 403, `Expected 403 but got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error.code, 'TENANT_ACCESS_DENIED');
});

let isolationCookie;

test('isolation admin CAN access their own workspace', async () => {
  isolationCookie = await login('isolation-admin@selora.local', SECOND_TENANT_PASSWORD);

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${secondWorkspaceId}/audit-events`,
    {
      headers: { cookie: isolationCookie },
    },
  );

  assert.equal(response.status, 200, `Expected 200 but got ${response.status}: ${JSON.stringify(body)}`);
  assert.ok(body.data.totalCount >= 1, 'Expected at least one audit event in isolation workspace');
});

test('isolation admin cannot access dev-tenant workspace', async () => {
  // Reuse cached cookie to avoid throttle
  const cookie = isolationCookie;
  assert.ok(cookie, 'Expected isolation cookie to be available from previous test');

  const defaultWorkspace = await prisma.workspace.findFirstOrThrow({
    where: { slug: 'default-workspace' },
  });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${defaultWorkspace.id}/memberships`,
    {
      headers: { cookie },
    },
  );

  assert.equal(response.status, 403, `Expected 403 but got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error.code, 'WORKSPACE_ACCESS_DENIED');
});
