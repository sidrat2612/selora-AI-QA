/**
 * Audit events & export integration tests
 *
 * Covers: list audit events, get event types, export audit data, tenant export.
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

  // Generate some audit events by performing actions
  adminCookie = await login('admin@selora.local', 'admin123');
  operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Create a suite to generate audit event
  await requestJson(`/api/v1/workspaces/${workspace.id}/suites`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Audit Test Suite' }),
  });

  // Update workspace settings to generate more events
  await requestJson(`/api/v1/workspaces/${workspace.id}/settings`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxTestsPerRun: 30 }),
  });
});

test.after(async () => {
  await stopApp();
  await prisma.$disconnect();
});

/* ── tests ─────────────────────────────────────────────────── */

let adminCookie;
let operatorCookie;

test('operator can list audit events with pagination', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/audit-events?page=1&perPage=10`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected audit event data');
  assert.ok(typeof body.data.totalCount === 'number', 'Expected totalCount');
  assert.ok(Array.isArray(body.data.items), 'Expected items array');
});

test('operator can list distinct event types', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/audit-events/event-types`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.data), 'Expected array of event types');
});

test('operator can export audit events as CSV/JSON', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Use raw fetch (export returns CSV, not JSON)
  const response = await fetch(
    `${baseUrl}/api/v1/workspaces/${workspace.id}/audit-events/export`,
    { headers: { cookie: operatorCookie }, redirect: 'manual' },
  );

  // Export should succeed (returns file stream, so status 200 or redirect)
  assert.ok([200, 302].includes(response.status), `Export status: ${response.status}`);
  if (response.status === 200) {
    const text = await response.text();
    assert.ok(text.length > 0, 'Expected non-empty export content');
  }
});

test('admin can export tenant data', async () => {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Tenant export may return JSON or streaming data
  const response = await fetch(
    `${baseUrl}/api/v1/tenants/${tenant.id}/export`,
    { headers: { cookie: adminCookie }, redirect: 'manual' },
  );

  assert.ok([200, 302].includes(response.status), `Tenant export status: ${response.status}`);
  if (response.status === 200) {
    const text = await response.text();
    assert.ok(text.length > 0, 'Expected non-empty tenant export');
  }
});

test('audit events can be filtered by event type', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/audit-events?eventType=suite.created`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(body.data, 'Expected filtered audit data');
  // All returned items should match the filter
  if (body.data.items?.length > 0) {
    for (const item of body.data.items) {
      assert.equal(item.eventType, 'suite.created', 'Event type filter should be applied');
    }
  }
});
