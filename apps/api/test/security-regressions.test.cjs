const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createApp } = require('../dist/bootstrap');

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, '../../..');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';

let app;
let baseUrl;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
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

  assert.equal(response.status, 201, `Expected login to succeed: ${JSON.stringify(body)}`);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Expected login response to set a session cookie.');
  return cookie.split(';', 1)[0];
}

test.before(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? '1025';
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? 'noreply@selora.local';
  process.env.API_SESSION_SECRET = process.env.API_SESSION_SECRET ?? 'dev-session-secret-change-in-prod';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  await resetState();
});

test.after(async () => {
  await stopApp();
  await prisma.$disconnect();
});

test.beforeEach(async () => {
  await resetState();
});

test('workspace operators cannot escalate a membership to tenant admin', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const operatorMembership = await prisma.membership.findFirstOrThrow({
    where: { user: { email: 'operator@selora.local' } },
  });
  const adminMembership = await prisma.membership.findFirstOrThrow({
    where: {
      role: 'TENANT_ADMIN',
      user: { email: 'admin@selora.local' },
      workspaceId: operatorMembership.workspaceId,
    },
  });

  const { response, body } = await requestJson(
    `/api/v1/workspaces/${adminMembership.workspaceId}/memberships/${adminMembership.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: operatorCookie,
      },
      body: JSON.stringify({ role: 'TENANT_ADMIN' }),
    },
  );

  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'ROLE_ASSIGNMENT_FORBIDDEN');
});

test('email verification tokens are single-use', async () => {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const suffix = crypto.randomUUID();
  const token = `verify-token-${suffix}`;
  const passwordHash = await bcrypt.hash('temporary-password', 12);
  const user = await prisma.user.create({
    data: {
      email: `verify-regression-${suffix}@selora.local`,
      name: 'Verify Regression',
      passwordHash,
      status: 'INVITED',
      memberships: {
        create: {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
          role: 'WORKSPACE_VIEWER',
          status: 'INVITED',
        },
      },
    },
  });

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const first = await requestJson('/api/v1/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const second = await requestJson('/api/v1/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 400);
  assert.equal(second.body.error.code, 'VERIFICATION_TOKEN_INVALID');
});

test('password reset tokens are single-use', async () => {
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@selora.local' } });
  const token = 'reset-token-regression';

  await prisma.passwordResetToken.create({
    data: {
      userId: adminUser.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const first = await requestJson('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: 'admin123456789' }),
  });
  const second = await requestJson('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: 'admin123456780' }),
  });

  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 400);
  assert.equal(second.body.error.code, 'RESET_TOKEN_INVALID');
});

test('login is throttled after repeated failed attempts', async () => {
  const statuses = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { response } = await requestJson('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@selora.local', password: 'wrong-password' }),
    });
    statuses.push(response.status);
  }

  assert.equal(statuses.at(-1), 429);
  assert.ok(statuses.includes(429), `Expected throttling response, got ${statuses.join(', ')}`);
});