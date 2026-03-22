/**
 * Tenant lifecycle, quota, and usage integration tests
 *
 * Covers: GET/PATCH tenant lifecycle, GET/PATCH quotas, GET workspace & tenant usage.
 * Verifies RBAC: operators cannot access tenant-level endpoints.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
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

/* ── tenant lifecycle tests ───────────────────────────────── */

let adminCookie;
let operatorCookie;

test('admin can read tenant lifecycle', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/tenants/${tenant.id}`,
    { headers: { cookie: adminCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected tenant lifecycle data');
  assert.equal(body.data.status, 'ACTIVE');
});

test('admin can update tenant lifecycle (suspend and reactivate)', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Suspend
  const { response: suspendRes, body: suspendBody } = await requestJson(
    `/api/v1/tenants/${tenant.id}`,
    {
      method: 'PATCH',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUSPENDED' }),
    },
  );

  assert.equal(suspendRes.status, 200, `Suspend failed: ${JSON.stringify(suspendBody)}`);

  // Reactivate
  const { response: reactivateRes, body: reactivateBody } = await requestJson(
    `/api/v1/tenants/${tenant.id}`,
    {
      method: 'PATCH',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    },
  );

  assert.equal(reactivateRes.status, 200, `Reactivate failed: ${JSON.stringify(reactivateBody)}`);
});

test('operator cannot access tenant lifecycle (RBAC enforcement)', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response } = await requestJson(
    `/api/v1/tenants/${tenant.id}`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 403);
});

/* ── quota tests ──────────────────────────────────────────── */

test('admin can read tenant quotas', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/tenants/${tenant.id}/quotas`,
    { headers: { cookie: adminCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected quota data');
});

test('admin can update tenant quotas', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/tenants/${tenant.id}/quotas`,
    {
      method: 'PATCH',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limits: { RUN_COUNT: 500 },
      }),
    },
  );

  assert.equal(response.status, 200, `Update quotas failed: ${JSON.stringify(body)}`);
});

test('operator cannot access tenant quotas (RBAC enforcement)', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response } = await requestJson(
    `/api/v1/tenants/${tenant.id}/quotas`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 403);
});

/* ── usage tests ──────────────────────────────────────────── */

test('admin can read tenant usage', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/tenants/${tenant.id}/usage`,
    { headers: { cookie: adminCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected usage data');
});

test('operator can read workspace usage', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/usage`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected workspace usage data');
});
