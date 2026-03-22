/**
 * Workspace management integration tests
 *
 * Covers: workspace details, environments CRUD, retention settings,
 * workspace settings, environment cloning, membership CRUD.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createApp } = require('../dist/bootstrap');

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, '../../..');
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';

let app;
let baseUrl;

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
  adminCookie = await login('admin@selora.local', 'admin123');
  operatorCookie = await login('operator@selora.local', 'operator123');
});

test.after(async () => {
  await stopApp();
  await prisma.$disconnect();
});

let adminCookie;
let operatorCookie;

/* ── workspace details ─────────────────────────────────────── */

test('admin can get workspace details', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}`,
    { headers: { cookie: adminCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected workspace data');
  assert.equal(body.data.id, workspace.id);
});

test('admin can create a new workspace', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/tenants/${tenant.id}/workspaces`,
    {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Test Workspace ${Date.now()}`,
        slug: `test-workspace-${Date.now()}`,
      }),
    },
  );

  assert.equal(response.status, 201, `Create workspace failed: ${JSON.stringify(body)}`);
  assert.ok(body.data?.id, 'Expected workspace ID');
});

/* ── environments ──────────────────────────────────────────── */

test('operator can list environments', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/environments`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.data), 'Expected array of environments');
  assert.ok(body.data.length >= 1, 'Expected at least one default environment');
});

test('operator can create and update an environment', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Create
  const { response: createRes, body: createBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/environments`,
    {
      method: 'POST',
      headers: { cookie: operatorCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Staging Environment',
        baseUrl: 'https://staging.example.com',
        secretRef: 'env/staging/default',
      }),
    },
  );

  assert.equal(createRes.status, 201, `Create env failed: ${JSON.stringify(createBody)}`);
  const envId = createBody.data?.id;
  assert.ok(envId, 'Expected environment ID');

  // Update
  const { response: updateRes, body: updateBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/environments/${envId}`,
    {
      method: 'PATCH',
      headers: { cookie: operatorCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://staging-v2.example.com' }),
    },
  );

  assert.equal(updateRes.status, 200, `Update env failed: ${JSON.stringify(updateBody)}`);
});

test('operator can clone an environment', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const env = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/environments/${env.id}/clone`,
    {
      method: 'POST',
      headers: { cookie: operatorCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cloned Env', secretRef: 'env/cloned/default' }),
    },
  );

  assert.equal(response.status, 201, `Clone env failed: ${JSON.stringify(body)}`);
  assert.ok(body.data?.id, 'Expected cloned environment ID');
  assert.notEqual(body.data.id, env.id, 'Cloned env should have different ID');
});

/* ── retention settings ────────────────────────────────────── */

test('admin can read and update retention settings', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Read
  const { response: getRes, body: getBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/settings/retention`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(getRes.status, 200);
  assert.ok(getBody.data, 'Expected retention data');

  // Update
  const { response: patchRes, body: patchBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/settings/retention`,
    {
      method: 'PATCH',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ logsDays: 60 }),
    },
  );
  assert.equal(patchRes.status, 200, `Update retention failed: ${JSON.stringify(patchBody)}`);
});

/* ── workspace settings ────────────────────────────────────── */

test('operator can update workspace settings', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/settings`,
    {
      method: 'PATCH',
      headers: { cookie: operatorCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxTestsPerRun: 50 }),
    },
  );

  assert.equal(response.status, 200, `Update settings failed: ${JSON.stringify(body)}`);
});

/* ── membership operations ──────────────────────────────────── */

test('admin can add a new member and remove them', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Pre-create user via Prisma (avoid SMTP email flow)
  const passwordHash = await bcrypt.hash('member-pass-123', 12);
  const memberEmail = `member-test-${Date.now()}@selora.local`;
  const newUser = await prisma.user.create({
    data: {
      email: memberEmail,
      name: 'Test Member',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  // Add membership via API using userId
  const { response: inviteRes, body: inviteBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/memberships`,
    {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: newUser.id, role: 'WORKSPACE_VIEWER' }),
    },
  );

  assert.equal(inviteRes.status, 201, `Add member failed: ${JSON.stringify(inviteBody)}`);
  const membershipId = inviteBody.data?.id;
  assert.ok(membershipId, 'Expected membership ID');

  // Delete
  const { response: deleteRes } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/memberships/${membershipId}`,
    {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    },
  );

  assert.equal(deleteRes.status, 200, 'Delete membership failed');
});

test('viewer cannot invite new members (RBAC enforcement)', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const passwordHash = await bcrypt.hash('viewer-pass-789', 12);
  const viewerEmail = `viewer-ws-test-${Date.now()}@selora.local`;
  await prisma.user.create({
    data: {
      email: viewerEmail,
      name: 'WS Viewer',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
          role: 'WORKSPACE_VIEWER',
          status: 'ACTIVE',
        },
      },
    },
  });

  const viewerCookie = await login(viewerEmail, 'viewer-pass-789');

  const { response } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/memberships`,
    {
      method: 'POST',
      headers: { cookie: viewerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@selora.local', role: 'WORKSPACE_VIEWER' }),
    },
  );

  assert.equal(response.status, 403);
});
