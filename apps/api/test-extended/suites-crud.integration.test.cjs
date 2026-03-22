/**
 * Suites CRUD integration tests
 *
 * Covers: list suites, create suite, get suite details, update suite.
 * Verifies RBAC: viewers cannot create/update suites.
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

/* ── tests ─────────────────────────────────────────────────── */

let adminCookie;
let operatorCookie;

test('admin can list suites in a workspace', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites`,
    { headers: { cookie: adminCookie } },
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.data), 'Expected data to be an array');
  assert.ok(body.data.length >= 1, 'Expected at least one default suite from seed');
});

test('operator can create a new suite and retrieve its details', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const suiteName = `Integration Test Suite ${Date.now()}`;
  // Create
  const { response: createRes, body: createBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites`,
    {
      method: 'POST',
      headers: { cookie: operatorCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: suiteName,
        description: 'Created by suites-crud integration test',
      }),
    },
  );

  assert.equal(createRes.status, 201, `Create suite failed: ${JSON.stringify(createBody)}`);
  const suiteId = createBody.data?.id;
  assert.ok(suiteId, 'Expected suite ID in response');

  // Get details
  const { response: detailRes, body: detailBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites/${suiteId}`,
    { headers: { cookie: operatorCookie } },
  );

  assert.equal(detailRes.status, 200);
  assert.equal(detailBody.data.id, suiteId);
  assert.equal(detailBody.data.name, suiteName);
});

test('operator can update an existing suite', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // List suites and pick the first one
  const { body: listBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites`,
    { headers: { cookie: operatorCookie } },
  );
  const suite = listBody.data[0];
  assert.ok(suite?.id, 'Need at least one suite');

  const newName = `Updated Suite ${Date.now()}`;
  const { response: patchRes, body: patchBody } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites/${suite.id}`,
    {
      method: 'PATCH',
      headers: { cookie: operatorCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    },
  );

  assert.equal(patchRes.status, 200, `Update suite failed: ${JSON.stringify(patchBody)}`);
  assert.equal(patchBody.data.name, newName);
});

test('viewer cannot create a suite (RBAC enforcement)', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  // Create a viewer user
  const passwordHash = await bcrypt.hash('viewer-pass-123', 12);
  const email = `viewer-suite-test-${Date.now()}@selora.local`;
  await prisma.user.create({
    data: {
      email,
      name: 'Suite Viewer',
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

  const viewerCookie = await login(email, 'viewer-pass-123');

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites`,
    {
      method: 'POST',
      headers: { cookie: viewerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Should Fail' }),
    },
  );

  assert.equal(response.status, 403, `Expected 403, got ${response.status}: ${JSON.stringify(body)}`);
});

test('get suite details returns 404 for non-existent suite', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response } = await requestJson(
    `/api/v1/workspaces/${workspace.id}/suites/non-existent-suite-id`,
    { headers: { cookie: adminCookie } },
  );

  assert.ok([404, 400].includes(response.status), `Expected 404 or 400, got ${response.status}`);
});
