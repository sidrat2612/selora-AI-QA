/**
 * Extended auth integration tests
 *
 * Covers: logout, forgot-password, session validation after logout.
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
});

test.after(async () => {
  await stopApp();
  await prisma.$disconnect();
});

/* ── tests ─────────────────────────────────────────────────── */

test('logout invalidates the session and prevents subsequent API calls', async () => {
  const cookie = await login('operator@selora.local', 'operator123');

  // Logout
  const { response: logoutRes, body: logoutBody } = await requestJson('/api/v1/auth/logout', {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(logoutRes.status, 201, `Logout failed: ${JSON.stringify(logoutBody)}`);
  assert.ok(logoutBody.data?.loggedOut, 'Expected loggedOut flag');

  // Session should be invalid after logout
  const { response: afterRes } = await requestJson('/api/v1/auth/session', {
    headers: { cookie },
  });
  assert.equal(afterRes.status, 401, 'Session should be invalid after logout');
});

test('forgot-password returns success for known and unknown emails (no leak)', async () => {
  // Known email
  const { response: knownRes, body: knownBody } = await requestJson('/api/v1/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@selora.local' }),
  });
  assert.equal(knownRes.status, 201, `Forgot-password failed: ${JSON.stringify(knownBody)}`);

  // Unknown email should also return success (prevents email enumeration)
  const { response: unknownRes } = await requestJson('/api/v1/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent-user@selora.local' }),
  });
  assert.equal(unknownRes.status, 201, 'Forgot-password should not reveal email existence');
});

test('unauthenticated requests to protected endpoints return 401', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response } = await requestJson(`/api/v1/workspaces/${workspace.id}/suites`);
  assert.equal(response.status, 401, 'Expected 401 for unauthenticated request');
});

test('session endpoint returns current user and workspace info', async () => {
  const cookie = await login('admin@selora.local', 'admin123');

  const { response, body } = await requestJson('/api/v1/auth/session', {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  assert.ok(body.data?.user, 'Expected user in session');
  assert.equal(body.data.user.email, 'admin@selora.local');
  assert.ok(body.data.activeWorkspace?.id, 'Expected active workspace in session');
});
