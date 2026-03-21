const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const { createApp } = require('../dist/bootstrap');

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, '../../..');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';
const localStorageDir = path.join(repoRoot, '.tmp', 'recording-tests-storage');
const validationHostRoot = repoRoot;

let app;
let baseUrl;
let fixtureServer;
let fixtureBaseUrl;

function configureInlineDockerValidation() {
  process.env.VALIDATION_HOST_ROOT = validationHostRoot;
  process.env.PLAYWRIGHT_RUNNER_IMAGE = process.env.PLAYWRIGHT_RUNNER_IMAGE ?? 'selora-playwright-runner';
  process.env.DOCKER_NETWORK = process.env.DOCKER_NETWORK ?? 'selora_default';
}

function ensurePlaywrightRunnerImage() {
  try {
    execFileSync('docker', ['image', 'inspect', process.env.PLAYWRIGHT_RUNNER_IMAGE], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    execFileSync('docker', ['compose', '--profile', 'build-only', 'build', 'playwright-runner'], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: process.env,
    });
  }
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

async function startFixtureServer() {
  fixtureServer = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<html><body><main>Run smoke ready</main></body></html>');
  });

  await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  const address = fixtureServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine fixture server address.');
  }

  fixtureBaseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopFixtureServer() {
  if (!fixtureServer) {
    return;
  }

  await new Promise((resolve, reject) => {
    fixtureServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  fixtureServer = undefined;
  fixtureBaseUrl = undefined;
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
  fs.rmSync(localStorageDir, { recursive: true, force: true });
  seedDatabase();
  await prisma.betaFeedback.deleteMany();
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

function resolveApiUrl(url) {
  return url.startsWith('http') ? url : `${baseUrl}${url}`;
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

async function uploadRecording(workspaceId, cookie, content, filename = 'login-recording.ts') {
  const form = new FormData();
  form.set('file', new Blob([content], { type: 'text/plain' }), filename);

  return requestJson(`/api/v1/workspaces/${workspaceId}/recordings`, {
    method: 'POST',
    headers: {
      cookie,
    },
    body: form,
  });
}

async function generateCanonicalTest(workspaceId, testId, cookie) {
  return requestJson(`/api/v1/workspaces/${workspaceId}/tests/${testId}/generate`, {
    method: 'POST',
    headers: { cookie },
  });
}

async function createRun(workspaceId, cookie, payload) {
  return requestJson(`/api/v1/workspaces/${workspaceId}/runs`, {
    method: 'POST',
    headers: {
      cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function updateTenantQuotas(tenantId, cookie, limits) {
  return requestJson(`/api/v1/tenants/${tenantId}/quotas`, {
    method: 'PATCH',
    headers: {
      cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limits }),
  });
}

async function updateTenantLifecycle(tenantId, cookie, payload) {
  return requestJson(`/api/v1/tenants/${tenantId}`, {
    method: 'PATCH',
    headers: {
      cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function createFeedback(workspaceId, cookie, payload) {
  return requestJson(`/api/v1/workspaces/${workspaceId}/feedback`, {
    method: 'POST',
    headers: {
      cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function updateFeedback(workspaceId, feedbackId, cookie, payload) {
  return requestJson(`/api/v1/workspaces/${workspaceId}/feedback/${feedbackId}`, {
    method: 'PATCH',
    headers: {
      cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function cancelRun(workspaceId, runId, cookie) {
  return requestJson(`/api/v1/workspaces/${workspaceId}/runs/${runId}/cancel`, {
    method: 'POST',
    headers: { cookie },
  });
}

async function updateWorkspaceSettings(workspaceId, cookie, payload) {
  return requestJson(`/api/v1/workspaces/${workspaceId}/settings`, {
    method: 'PATCH',
    headers: {
      cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function pollForRecording(workspaceId, recordingId, cookie) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { response, body } = await requestJson(
      `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}`,
      {
        headers: { cookie },
      },
    );

    assert.equal(response.status, 200);
    if (body.data.status === 'NORMALIZED' || body.data.status === 'FAILED') {
      return body.data;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Timed out waiting for recording ingestion to complete.');
}

test.before(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? '1025';
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? 'noreply@selora.local';
  process.env.API_SESSION_SECRET = process.env.API_SESSION_SECRET ?? 'dev-session-secret-change-in-prod';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.QUEUE_MODE = 'inline';
  process.env.STORAGE_DRIVER = 'local';
  process.env.LOCAL_STORAGE_DIR = localStorageDir;
  configureInlineDockerValidation();
  ensurePlaywrightRunnerImage();
  delete process.env.AI_PROVIDER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await startFixtureServer();
  await resetState();
});

test.after(async () => {
  await stopApp();
  await stopFixtureServer();
  await prisma.$disconnect();
  fs.rmSync(localStorageDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await resetState();
});

test('uploading a Playwright recording creates a canonical test asynchronously', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const recordingContent = `
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Welcome back')).toBeVisible();
});
`;

  const { response, body } = await uploadRecording(workspace.id, operatorCookie, recordingContent);

  assert.equal(response.status, 201);
  assert.equal(body.data.status, 'UPLOADED');
  assert.equal(body.data.queued, true);
  assert.ok(body.data.recordingId);

  const normalized = await pollForRecording(workspace.id, body.data.recordingId, operatorCookie);
  assert.equal(normalized.status, 'NORMALIZED');
  const createdCanonicalTest = normalized.canonicalTests.find((item) => item.name === 'user can login');
  assert.ok(createdCanonicalTest, 'Expected the uploaded recording to create a canonical test.');

  const testList = await requestJson(`/api/v1/workspaces/${workspace.id}/tests`, {
    headers: { cookie: operatorCookie },
  });
  assert.equal(testList.response.status, 200);
  const uploadedTest = testList.body.data.items.find((item) => item.recordingAsset.id === body.data.recordingId);
  assert.ok(uploadedTest, 'Expected the uploaded recording to appear in the canonical test list.');
  assert.equal(uploadedTest.status, 'INGESTED');
});

test('recording and canonical test lists support pagination and filters', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const checkoutUpload = await uploadRecording(
    workspace.id,
    operatorCookie,
    "import { test } from '@playwright/test';\n\ntest('checkout journey', async ({ page }) => {\n  await page.goto('https://example.com/cart');\n  await page.getByRole('button', { name: 'Checkout' }).click();\n});\n",
    'checkout-recording.ts',
  );
  const accountUpload = await uploadRecording(
    workspace.id,
    operatorCookie,
    "import { test } from '@playwright/test';\n\ntest('account profile', async ({ page }) => {\n  await page.goto('https://example.com/account');\n  await page.getByText('Profile').click();\n});\n",
    'account-recording.ts',
  );

  await pollForRecording(workspace.id, checkoutUpload.body.data.recordingId, operatorCookie);
  await pollForRecording(workspace.id, accountUpload.body.data.recordingId, operatorCookie);

  const pagedRecordings = await requestJson(
    `/api/v1/workspaces/${workspace.id}/recordings?page=1&pageSize=1&status=NORMALIZED&search=checkout`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(pagedRecordings.response.status, 200);
  assert.equal(pagedRecordings.body.data.page, 1);
  assert.equal(pagedRecordings.body.data.pageSize, 1);
  assert.equal(pagedRecordings.body.data.items.length, 1);
  assert.equal(pagedRecordings.body.data.items[0].filename, 'checkout-recording.ts');

  const filteredTests = await requestJson(
    `/api/v1/workspaces/${workspace.id}/tests?page=1&pageSize=10&status=INGESTED&tag=account&search=account`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(filteredTests.response.status, 200);
  assert.ok(filteredTests.body.data.totalCount >= 1);
  assert.ok(
    filteredTests.body.data.items.some((item) => item.name === 'account profile'),
    'Expected filtered canonical tests to include the account profile test.',
  );
});

test('workspace feedback can be submitted, filtered, and prioritized', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const creation = await createFeedback(workspace.id, operatorCookie, {
    title: 'Repair analytics needs export',
    summary: 'Beta reviewers want to export the filtered repair attempts to CSV during triage.',
    category: 'FEATURE_REQUEST',
  });

  assert.equal(creation.response.status, 201);
  assert.equal(creation.body.data.status, 'SUBMITTED');
  assert.equal(creation.body.data.priority, 'MEDIUM');
  assert.equal(creation.body.data.category, 'FEATURE_REQUEST');

  const listing = await requestJson(`/api/v1/workspaces/${workspace.id}/feedback?category=FEATURE_REQUEST`, {
    headers: { cookie: operatorCookie },
  });

  assert.equal(listing.response.status, 200);
  assert.equal(listing.body.data.length, 1);
  assert.equal(listing.body.data[0].id, creation.body.data.id);

  const update = await updateFeedback(workspace.id, creation.body.data.id, operatorCookie, {
    priority: 'HIGH',
    status: 'PLANNED',
  });

  assert.equal(update.response.status, 200);
  assert.equal(update.body.data.priority, 'HIGH');
  assert.equal(update.body.data.status, 'PLANNED');

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      workspaceId: workspace.id,
      entityId: creation.body.data.id,
      eventType: { in: ['beta_feedback.created', 'beta_feedback.updated'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  assert.equal(auditEvents.length, 2);
});

test('feedback updates are restricted to elevated workspace roles', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const viewerPasswordHash = await bcrypt.hash('viewer123', 12);
  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@selora.local' },
    update: {
      name: 'Workspace Viewer',
      passwordHash: viewerPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: crypto.randomUUID(),
      email: 'viewer@selora.local',
      name: 'Workspace Viewer',
      passwordHash: viewerPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: workspace.tenantId,
        userId: viewerUser.id,
        workspaceId: workspace.id,
        role: 'WORKSPACE_VIEWER',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: crypto.randomUUID(),
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      userId: viewerUser.id,
      role: 'WORKSPACE_VIEWER',
      status: 'ACTIVE',
    },
  });

  const viewerCookie = await login('viewer@selora.local', 'viewer123');

  const creation = await createFeedback(workspace.id, operatorCookie, {
    title: 'Queue outage visibility',
    summary: 'Users need a clearer message when queue-backed processing is unavailable.',
    category: 'UX',
  });

  assert.equal(creation.response.status, 201);

  const forbiddenUpdate = await updateFeedback(workspace.id, creation.body.data.id, viewerCookie, {
    status: 'REVIEWED',
  });

  assert.equal(forbiddenUpdate.response.status, 403);
});

test('invalid uploads are rejected before persistence', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const { response, body } = await uploadRecording(
    workspace.id,
    operatorCookie,
    'console.log("not a recording");',
    'not-a-recording.ts',
  );

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'MISSING_PLAYWRIGHT_TEST');

  const recordings = await prisma.recordingAsset.findMany({
    where: { workspaceId: workspace.id, filename: 'not-a-recording.ts' },
  });
  assert.equal(recordings.length, 0);
});

test('generating a Playwright artifact creates a versioned generated test and validates it', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const upload = await uploadRecording(
    workspace.id,
    operatorCookie,
    "import { test, expect } from '@playwright/test';\n\ntest('checkout flow', async ({ page }) => {\n  await page.goto('https://example.com/checkout');\n  await page.getByLabel('Email').fill('qa@example.com');\n  await page.getByRole('button', { name: 'Submit order' }).click();\n  await expect(page.getByText('Order confirmed')).toBeVisible();\n});\n",
    'checkout-flow.ts',
  );

  const normalized = await pollForRecording(workspace.id, upload.body.data.recordingId, operatorCookie);
  const createdCanonicalTest = normalized.canonicalTests.find((item) => item.name === 'checkout flow');
  assert.ok(createdCanonicalTest, 'Expected a canonical test to be generated before requesting artifact generation.');

  const generation = await generateCanonicalTest(workspace.id, createdCanonicalTest.id, operatorCookie);
  assert.equal(generation.response.status, 201);
  assert.equal(generation.body.data.version, 1);
  assert.equal(generation.body.data.status, 'READY');
  assert.equal(generation.body.data.validationStatus, 'VALIDATED');

  const persistedTest = await prisma.canonicalTest.findFirstOrThrow({
    where: { id: createdCanonicalTest.id },
    include: { generatedArtifacts: { orderBy: { version: 'desc' } } },
  });
  assert.equal(persistedTest.status, 'VALIDATED');
  assert.equal(persistedTest.generatedArtifacts.length, 1);
  assert.equal(persistedTest.generatedArtifacts[0].status, 'READY');
  assert.match(persistedTest.generatedArtifacts[0].fileName, /checkout-flow\.spec\.ts$/);
});

test('repair attempts endpoint returns stored diff history for a generated artifact', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const upload = await uploadRecording(
    workspace.id,
    operatorCookie,
    "import { test } from '@playwright/test';\n\ntest('repairable checkout flow', async ({ page }) => {\n  await page.goto('https://example.com/checkout');\n  await page.getByRole('button', { name: 'Submit order' }).click();\n});\n",
    'repairable-checkout.ts',
  );

  const normalized = await pollForRecording(workspace.id, upload.body.data.recordingId, operatorCookie);
  const createdCanonicalTest = normalized.canonicalTests.find((item) => item.name === 'repairable checkout flow');
  assert.ok(createdCanonicalTest, 'Expected a canonical test before seeding repair attempts.');

  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const generatedStorageKey = `${tenant.id}/${workspace.id}/generated-tests/v1-repairable-checkout.spec.ts`;
  const patchStorageKey = `${tenant.id}/${workspace.id}/repair-patches/generated-artifact-1/attempt-1/repair-attempt-1.diff`;
  const generatedFilePath = path.join(localStorageDir, generatedStorageKey);
  const patchFilePath = path.join(localStorageDir, patchStorageKey);
  const patchText = [
    '--- before.ts',
    '+++ after.ts',
    '@@ -1,1 +1,1 @@',
    "-await page.getByRole('button', { name: 'Submit order' }).click();",
    "+await page.getByRole('button', { name: 'Submit order' }).first().click();",
  ].join('\n');

  fs.mkdirSync(path.dirname(generatedFilePath), { recursive: true });
  fs.writeFileSync(generatedFilePath, '// generated artifact');
  fs.mkdirSync(path.dirname(patchFilePath), { recursive: true });
  fs.writeFileSync(patchFilePath, patchText);

  const generatedArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: createdCanonicalTest.id,
      version: 1,
      fileName: 'repairable-checkout.spec.ts',
      storageKey: generatedStorageKey,
      checksum: 'seeded-checksum',
      generatorVersion: 'test-generator',
      status: 'FAILED',
    },
  });

  const patchArtifact = await prisma.artifact.create({
    data: {
      workspaceId: workspace.id,
      generatedTestArtifactId: generatedArtifact.id,
      artifactType: 'REPAIR_DIFF',
      fileName: 'repair-attempt-1.diff',
      storageKey: patchStorageKey,
      contentType: 'text/x-diff',
      sizeBytes: BigInt(Buffer.byteLength(patchText)),
      checksum: 'patch-checksum',
    },
  });

  await prisma.aIRepairAttempt.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: createdCanonicalTest.id,
      generatedTestArtifactId: generatedArtifact.id,
      attemptNumber: 1,
      repairMode: 'RULE_BASED',
      inputFailureHash: 'failure-hash',
      promptVersion: 'rule-based-v1',
      status: 'RERUN_FAILED',
      diffSummary: 'Rule-based selector repair applied.',
      patchStorageKey,
      sanitizationMetadataJson: {
        failureClass: 'SELECTOR',
      },
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  const attemptsResponse = await requestJson(
    `/api/v1/workspaces/${workspace.id}/tests/${createdCanonicalTest.id}/repair-attempts`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(attemptsResponse.response.status, 200);
  assert.equal(attemptsResponse.body.data.length, 1);
  assert.equal(attemptsResponse.body.data[0].repairMode, 'RULE_BASED');
  assert.equal(attemptsResponse.body.data[0].patchArtifact.id, patchArtifact.id);
  assert.match(attemptsResponse.body.data[0].patchText, /first\(\)\.click/);
});

test('repair analytics endpoint returns aggregates, trends, and filtered attempt lists', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });

  // Clean up any repair attempts left over from prior tests (seed does not truncate them)
  await prisma.aIRepairAttempt.deleteMany({ where: { workspaceId: workspace.id } });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'repair-analytics-recording.ts',
      originalPath: 'repair-analytics-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/repair-analytics-recording.ts`,
      checksum: 'repair-analytics-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const checkoutTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'checkout flow',
      definitionJson: { flow: 'checkout' },
      status: 'NEEDS_HUMAN_REVIEW',
    },
  });

  const loginTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'login flow',
      definitionJson: { flow: 'login' },
      status: 'AUTO_REPAIRED',
    },
  });

  const checkoutArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: checkoutTest.id,
      version: 1,
      fileName: 'checkout-flow.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/checkout-flow.spec.ts`,
      checksum: 'checkout-artifact-checksum',
      generatorVersion: 'test-generator',
      status: 'FAILED',
    },
  });

  const loginArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: loginTest.id,
      version: 2,
      fileName: 'login-flow.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/login-flow.spec.ts`,
      checksum: 'login-artifact-checksum',
      generatorVersion: 'test-generator',
      status: 'READY',
    },
  });

  await prisma.aIRepairAttempt.createMany({
    data: [
      {
        workspaceId: workspace.id,
        canonicalTestId: checkoutTest.id,
        generatedTestArtifactId: checkoutArtifact.id,
        attemptNumber: 1,
        repairMode: 'RULE_BASED',
        inputFailureHash: 'analytics-failure-1',
        promptVersion: 'rule-v1',
        status: 'RERUN_FAILED',
        diffSummary: 'Selector strategy did not stabilize the checkout button.',
        startedAt: new Date('2026-03-01T10:00:00.000Z'),
        finishedAt: new Date('2026-03-01T10:02:00.000Z'),
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
      },
      {
        workspaceId: workspace.id,
        canonicalTestId: loginTest.id,
        generatedTestArtifactId: loginArtifact.id,
        attemptNumber: 1,
        repairMode: 'RULE_BASED',
        inputFailureHash: 'analytics-failure-2',
        promptVersion: 'rule-v2',
        status: 'RERUN_PASSED',
        diffSummary: 'Rule-based timeout adjustment cleared the rerun.',
        startedAt: new Date('2026-03-02T09:00:00.000Z'),
        finishedAt: new Date('2026-03-02T09:01:30.000Z'),
        createdAt: new Date('2026-03-02T09:00:00.000Z'),
      },
      {
        workspaceId: workspace.id,
        canonicalTestId: checkoutTest.id,
        generatedTestArtifactId: checkoutArtifact.id,
        attemptNumber: 2,
        repairMode: 'LLM_ASSISTED',
        inputFailureHash: 'analytics-failure-3',
        promptVersion: 'llm-v1',
        modelName: 'gpt-5.4-mini',
        status: 'HUMAN_REVIEW_REQUIRED',
        diffSummary: 'LLM suggestion still requires review for selector drift.',
        startedAt: new Date('2026-03-03T08:00:00.000Z'),
        finishedAt: new Date('2026-03-03T08:04:00.000Z'),
        createdAt: new Date('2026-03-03T08:00:00.000Z'),
      },
    ],
  });

  const analyticsResponse = await requestJson(
    `/api/v1/workspaces/${workspace.id}/repair-analytics?since=2026-03-01&until=2026-03-04&page=1&pageSize=2`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(analyticsResponse.response.status, 200);
  assert.equal(analyticsResponse.body.data.workspaceId, workspace.id);
  assert.equal(analyticsResponse.body.data.totals.totalAttempts, 3);
  assert.equal(analyticsResponse.body.data.totals.successfulAttempts, 1);
  assert.equal(analyticsResponse.body.data.totals.successRate, 33.3);
  assert.equal(analyticsResponse.body.data.attempts.totalCount, 3);
  assert.equal(analyticsResponse.body.data.attempts.items.length, 2);
  assert.equal(analyticsResponse.body.data.attempts.hasMore, true);

  const ruleBased = analyticsResponse.body.data.byMode.find((entry) => entry.repairMode === 'RULE_BASED');
  const llmAssisted = analyticsResponse.body.data.byMode.find((entry) => entry.repairMode === 'LLM_ASSISTED');
  assert.equal(ruleBased.totalAttempts, 2);
  assert.equal(ruleBased.successfulAttempts, 1);
  assert.equal(ruleBased.successRate, 50);
  assert.equal(llmAssisted.totalAttempts, 1);
  assert.equal(llmAssisted.successfulAttempts, 0);
  assert.equal(llmAssisted.successRate, 0);
  assert.equal(
    analyticsResponse.body.data.trends.some(
      (point) => point.bucketStart.startsWith('2026-03-02') && point.successfulAttempts === 1,
    ),
    true,
  );

  const filteredResponse = await requestJson(
    `/api/v1/workspaces/${workspace.id}/repair-analytics?since=2026-03-01&until=2026-03-04&mode=RULE_BASED&status=RERUN_PASSED`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(filteredResponse.response.status, 200);
  assert.equal(filteredResponse.body.data.totals.totalAttempts, 1);
  assert.equal(filteredResponse.body.data.totals.successfulAttempts, 1);
  assert.equal(filteredResponse.body.data.totals.successRate, 100);
  assert.equal(filteredResponse.body.data.attempts.items[0].repairMode, 'RULE_BASED');
  assert.equal(filteredResponse.body.data.attempts.items[0].status, 'RERUN_PASSED');
});

test('creating a run executes READY artifacts and returns run items with captured logs', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });

  // Clean up accumulated runs from prior tests so concurrency limit is not hit
  await prisma.testRunItem.deleteMany({ where: { testRun: { workspaceId: workspace.id } } });
  await prisma.testRun.deleteMany({ where: { workspaceId: workspace.id } });

  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.environment.update({
    where: { id: environment.id },
    data: {
      baseUrl: fixtureBaseUrl,
    },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'run-smoke-recording.ts',
      originalPath: 'run-smoke-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/run-smoke-recording.ts`,
      checksum: 'recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'run smoke test',
      definitionJson: { flow: 'run-smoke' },
      status: 'VALIDATED',
    },
  });

  const generatedCode = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('run smoke test', async ({ page }) => {",
    "  await page.goto('/');",
    "  await expect(page.getByText('Run smoke ready')).toBeVisible();",
    '});',
    '',
  ].join('\n');

  const storageKey = `${workspace.tenantId}/${workspace.id}/generated-tests/v1-run-smoke-test.spec.ts`;
  const generatedFilePath = path.join(localStorageDir, storageKey);
  fs.mkdirSync(path.dirname(generatedFilePath), { recursive: true });
  fs.writeFileSync(generatedFilePath, generatedCode);

  await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'run-smoke-test.spec.ts',
      storageKey,
      checksum: 'generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: [canonicalTest.id],
  });

  assert.equal(creation.response.status, 201);
  assert.equal(creation.body.data.status, 'PASSED');
  assert.equal(creation.body.data.passedCount, 1);

  const runList = await requestJson(`/api/v1/workspaces/${workspace.id}/runs`, {
    headers: { cookie: operatorCookie },
  });
  assert.equal(runList.response.status, 200);
  const createdRunSummary = runList.body.data.items.find((item) => item.id === creation.body.data.id);
  assert.ok(createdRunSummary, 'Expected the created run to appear in the run list.');
  assert.equal(createdRunSummary.status, 'PASSED');

  const runItems = await requestJson(
    `/api/v1/workspaces/${workspace.id}/runs/${creation.body.data.id}/items`,
    {
      headers: { cookie: operatorCookie },
    },
  );
  assert.equal(runItems.response.status, 200);
  assert.equal(runItems.body.data.length, 1);
  assert.equal(runItems.body.data[0].status, 'PASSED');
  assert.ok(
    runItems.body.data[0].artifacts.some((artifact) => artifact.artifactType === 'LOG'),
    'Expected run item artifacts to include the execution log.',
  );

  const logArtifact = runItems.body.data[0].artifacts.find((artifact) => artifact.artifactType === 'LOG');
  assert.ok(logArtifact, 'Expected a persisted execution log artifact.');

  const download = await fetch(
    `${baseUrl}/api/v1/workspaces/${workspace.id}/runs/${creation.body.data.id}/items/${runItems.body.data[0].id}/artifacts/${logArtifact.id}/download`,
    {
      headers: { cookie: operatorCookie },
      redirect: 'manual',
    },
  );

  assert.equal(download.status, 302);
  const signedUrl = download.headers.get('location');
  assert.ok(signedUrl, 'Expected download request to redirect to a signed artifact URL.');
  assert.match(signedUrl, /\/artifact-downloads\//);

  const signedDownload = await fetch(resolveApiUrl(signedUrl));

  assert.equal(signedDownload.status, 200);
  assert.match(signedDownload.headers.get('content-type') || '', /text\/plain/);
  assert.match(signedDownload.headers.get('content-disposition') || '', /inline; filename=".+"/);
  assert.match(await signedDownload.text(), /status=PASSED/);

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      workspaceId: workspace.id,
      entityId: logArtifact.id,
      eventType: { in: ['artifact.download_url_issued', 'artifact.downloaded'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['artifact.download_url_issued', 'artifact.downloaded'],
  );
});

test('validation artifact downloads issue signed URLs and reject expired tokens', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'validation-download-recording.ts',
      originalPath: 'validation-download-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/validation-download-recording.ts`,
      checksum: 'validation-download-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'validation download test',
      definitionJson: { flow: 'validation-download' },
      status: 'VALIDATED',
    },
  });

  const generatedArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'validation-download.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/validation-download.spec.ts`,
      checksum: 'validation-download-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  const validationContent = '{"status":"ok"}\n';
  const validationStorageKey = `${workspace.tenantId}/${workspace.id}/artifacts/${generatedArtifact.id}/validation-report.json`;
  const validationFilePath = path.join(localStorageDir, validationStorageKey);
  fs.mkdirSync(path.dirname(validationFilePath), { recursive: true });
  fs.writeFileSync(validationFilePath, validationContent);

  const validationArtifact = await prisma.artifact.create({
    data: {
      workspaceId: workspace.id,
      generatedTestArtifactId: generatedArtifact.id,
      artifactType: 'GENERATED_TEST',
      fileName: 'validation-report.json',
      storageKey: validationStorageKey,
      contentType: 'application/json',
      sizeBytes: BigInt(Buffer.byteLength(validationContent)),
      checksum: 'validation-download-artifact-checksum',
    },
  });

  const previousTtl = process.env.ARTIFACT_DOWNLOAD_TTL_SECONDS;
  process.env.ARTIFACT_DOWNLOAD_TTL_SECONDS = '1';

  try {
    const issuance = await fetch(
      `${baseUrl}/api/v1/workspaces/${workspace.id}/tests/${canonicalTest.id}/generated-artifacts/${generatedArtifact.id}/artifacts/${validationArtifact.id}/download`,
      {
        headers: { cookie: operatorCookie },
        redirect: 'manual',
      },
    );

    assert.equal(issuance.status, 302);
    const signedUrl = issuance.headers.get('location');
    assert.ok(signedUrl, 'Expected validation artifact download to redirect to a signed URL.');

    const immediateDownload = await fetch(resolveApiUrl(signedUrl));
    assert.equal(immediateDownload.status, 200);
    assert.match(immediateDownload.headers.get('content-type') || '', /application\/json/);
    assert.match(immediateDownload.headers.get('content-disposition') || '', /attachment; filename="validation-report\.json"/);
    assert.match(await immediateDownload.text(), /"status":"ok"/);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const expiredDownload = await fetch(resolveApiUrl(signedUrl));
    assert.equal(expiredDownload.status, 400);
    const expiredBody = await expiredDownload.json();
    assert.equal(expiredBody.error.code, 'ARTIFACT_DOWNLOAD_URL_EXPIRED');

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        workspaceId: workspace.id,
        entityId: validationArtifact.id,
        eventType: { in: ['artifact.download_url_issued', 'artifact.downloaded'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    assert.deepEqual(
      auditEvents.map((event) => event.eventType),
      ['artifact.download_url_issued', 'artifact.downloaded'],
    );
  } finally {
    if (previousTtl === undefined) {
      delete process.env.ARTIFACT_DOWNLOAD_TTL_SECONDS;
    } else {
      process.env.ARTIFACT_DOWNLOAD_TTL_SECONDS = previousTtl;
    }
  }
});

test('creating a run rejects tests that are not execution-ready', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });

  // Clean up accumulated runs from prior tests
  await prisma.testRunItem.deleteMany({ where: { testRun: { workspaceId: workspace.id } } });
  await prisma.testRun.deleteMany({ where: { workspaceId: workspace.id } });

  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'ineligible-recording.ts',
      originalPath: 'ineligible-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/ineligible-recording.ts`,
      checksum: 'recording-checksum-2',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const ineligibleTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'not ready for execution',
      definitionJson: { flow: 'not-ready' },
      status: 'GENERATED',
    },
  });

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: [ineligibleTest.id],
  });

  assert.equal(creation.response.status, 400);
  assert.equal(creation.body.error.code, 'RUN_TEST_SELECTION_INVALID');
});

test('canceling a queued run marks remaining items and the run as canceled', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'cancel-recording.ts',
      originalPath: 'cancel-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/cancel-recording.ts`,
      checksum: 'cancel-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'cancelable run item',
      definitionJson: { flow: 'cancel' },
      status: 'VALIDATED',
    },
  });

  const generatedArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'cancelable.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-cancelable.spec.ts`,
      checksum: 'cancel-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  const run = await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'QUEUED',
      totalCount: 2,
      queuedCount: 2,
      runningCount: 0,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      items: {
        create: [
          {
            canonicalTestId: canonicalTest.id,
            generatedTestArtifactId: generatedArtifact.id,
            sequence: 1,
            status: 'QUEUED',
          },
          {
            canonicalTestId: canonicalTest.id,
            generatedTestArtifactId: generatedArtifact.id,
            sequence: 2,
            status: 'RUNNING',
            startedAt: new Date(),
          },
        ],
      },
    },
    include: {
      items: { select: { id: true } },
    },
  });

  const cancellation = await cancelRun(workspace.id, run.id, operatorCookie);

  assert.equal(cancellation.response.status, 201);
  assert.equal(cancellation.body.data.status, 'CANCELED');
  assert.equal(cancellation.body.data.canceledCount, 2);

  const items = await requestJson(`/api/v1/workspaces/${workspace.id}/runs/${run.id}/items`, {
    headers: { cookie: operatorCookie },
  });
  assert.equal(items.response.status, 200);
  assert.equal(items.body.data.every((item) => item.status === 'CANCELED'), true);
});

test('cloning an environment preserves runtime config while requiring a new secret', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const source = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.environment.update({
    where: { id: source.id },
    data: {
      testTimeoutMs: 45000,
      runTimeoutMs: 180000,
      maxRetries: 2,
    },
  });

  const cloneResponse = await requestJson(
    `/api/v1/workspaces/${workspace.id}/environments/${source.id}/clone`,
    {
      method: 'POST',
      headers: {
        cookie: operatorCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Cloned Environment',
        secretRef: 'env/dev/cloned',
        secretValue: 'cloned-secret-value',
      }),
    },
  );

  assert.equal(cloneResponse.response.status, 201);
  assert.equal(cloneResponse.body.data.name, 'Cloned Environment');
  assert.equal(cloneResponse.body.data.baseUrl, source.baseUrl);
  assert.equal(cloneResponse.body.data.secretRef, 'env/dev/cloned');
  assert.equal(cloneResponse.body.data.testTimeoutMs, 45000);
  assert.equal(cloneResponse.body.data.runTimeoutMs, 180000);
  assert.equal(cloneResponse.body.data.maxRetries, 2);
  assert.equal(cloneResponse.body.data.isDefault, false);

  const storedClone = await prisma.environment.findUniqueOrThrow({
    where: { id: cloneResponse.body.data.id },
  });

  assert.ok(storedClone.encryptedSecretJson, 'Expected cloned environment secret to be stored encrypted.');
  assert.equal(storedClone.encryptedSecretJson.includes('cloned-secret-value'), false);

  const auditEvent = await prisma.auditEvent.findFirst({
    where: {
      workspaceId: workspace.id,
      eventType: 'environment.cloned',
      entityId: cloneResponse.body.data.id,
    },
  });
  assert.ok(auditEvent, 'Expected environment clone audit event to be recorded.');
});

test('workspace concurrent execution limit blocks additional run creation', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { concurrentExecutionLimit: 1 },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'concurrency-recording.ts',
      originalPath: 'concurrency-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/concurrency-recording.ts`,
      checksum: 'concurrency-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'concurrency protected test',
      definitionJson: { flow: 'concurrency' },
      status: 'VALIDATED',
    },
  });

  await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'concurrency.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-concurrency.spec.ts`,
      checksum: 'concurrency-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'RUNNING',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 1,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date(),
    },
  });

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: [canonicalTest.id],
  });

  assert.equal(creation.response.status, 400);
  assert.equal(creation.body.error.code, 'CONCURRENT_LIMIT_REACHED');
});

test('workspace max tests per run blocks oversized run requests', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  const settingsResponse = await updateWorkspaceSettings(workspace.id, operatorCookie, {
    maxTestsPerRun: 1,
  });

  assert.equal(settingsResponse.response.status, 200);
  assert.equal(settingsResponse.body.data.maxTestsPerRun, 1);

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'oversized-run-recording.ts',
      originalPath: 'oversized-run-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/oversized-run-recording.ts`,
      checksum: 'oversized-run-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const tests = await Promise.all(
    ['first limited test', 'second limited test'].map((name) =>
      prisma.canonicalTest.create({
        data: {
          workspaceId: workspace.id,
          recordingAssetId: recordingAsset.id,
          name,
          definitionJson: { flow: name },
          status: 'VALIDATED',
        },
      }),
    ),
  );

  await Promise.all(
    tests.map((test, index) =>
      prisma.generatedTestArtifact.create({
        data: {
          workspaceId: workspace.id,
          canonicalTestId: test.id,
          version: 1,
          fileName: `limited-${index + 1}.spec.ts`,
          storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-limited-${index + 1}.spec.ts`,
          checksum: `limited-checksum-${index + 1}`,
          generatorVersion: 'integration-test',
          status: 'READY',
          createdByUserId: operator.id,
        },
      }),
    ),
  );

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: tests.map((test) => test.id),
  });

  assert.equal(creation.response.status, 400);
  assert.equal(creation.body.error.code, 'RUN_TEST_COUNT_LIMIT_REACHED');
});

test('workspace run cooldown blocks rapid run creation', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.testRunItem.deleteMany({ where: { testRun: { workspaceId: workspace.id } } });
  await prisma.testRun.deleteMany({ where: { workspaceId: workspace.id } });

  const settingsResponse = await updateWorkspaceSettings(workspace.id, operatorCookie, {
    runCooldownSeconds: 3600,
  });

  assert.equal(settingsResponse.response.status, 200);
  assert.equal(settingsResponse.body.data.runCooldownSeconds, 3600);

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'cooldown-recording.ts',
      originalPath: 'cooldown-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/cooldown-recording.ts`,
      checksum: 'cooldown-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'cooldown protected test',
      definitionJson: { flow: 'cooldown' },
      status: 'VALIDATED',
    },
  });

  await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'cooldown.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-cooldown.spec.ts`,
      checksum: 'cooldown-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'PASSED',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date(),
      finishedAt: new Date(),
      createdAt: new Date(),
    },
  });

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: [canonicalTest.id],
  });

  assert.equal(creation.response.status, 400);
  assert.equal(creation.body.error.code, 'RUN_COOLDOWN_ACTIVE');
});

test('tenant quota endpoint returns current usage and persists configured limits', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const initialResponse = await requestJson(`/api/v1/tenants/${workspace.tenantId}/quotas`, {
    headers: { cookie: adminCookie },
  });

  assert.equal(initialResponse.response.status, 200);
  assert.equal(initialResponse.body.data.tenantId, workspace.tenantId);
  assert.equal(initialResponse.body.data.metrics.some((metric) => metric.metricType === 'RUN_COUNT'), true);

  const updateResponse = await updateTenantQuotas(workspace.tenantId, adminCookie, {
    RUN_COUNT: 25,
    USER_SEATS: 8,
    ARTIFACT_STORAGE_BYTES: 500000,
  });

  assert.equal(updateResponse.response.status, 200);
  assert.equal(
    updateResponse.body.data.metrics.find((metric) => metric.metricType === 'RUN_COUNT').limit,
    25,
  );
  assert.equal(
    updateResponse.body.data.metrics.find((metric) => metric.metricType === 'USER_SEATS').limit,
    8,
  );
});

test('tenant lifecycle endpoints export sanitized data and enforce suspension and soft-delete blocks', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.environment.update({
    where: { id: environment.id },
    data: {
      encryptedSecretJson: '{"ciphertext":"hidden"}',
    },
  });

  const overviewResponse = await requestJson(`/api/v1/tenants/${workspace.tenantId}`, {
    headers: { cookie: adminCookie },
  });

  assert.equal(overviewResponse.response.status, 200);
  assert.equal(overviewResponse.body.data.id, workspace.tenantId);
  assert.equal(overviewResponse.body.data.status, 'ACTIVE');
  assert.equal(overviewResponse.body.data.counts.workspaces >= 1, true);

  const exportResponse = await fetch(`${baseUrl}/api/v1/tenants/${workspace.tenantId}/export`, {
    headers: { cookie: adminCookie },
  });

  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-disposition') || '', /tenant-.*-export\.json/);

  const exportPayload = JSON.parse(await exportResponse.text());
  assert.equal(exportPayload.tenant.id, workspace.tenantId);
  assert.equal(Array.isArray(exportPayload.environments), true);
  assert.equal(exportPayload.environments[0].encryptedSecretJson, undefined);
  assert.equal(exportPayload.environments.some((item) => item.secretRef === environment.secretRef), true);

  const suspendResponse = await updateTenantLifecycle(workspace.tenantId, adminCookie, {
    status: 'SUSPENDED',
  });

  assert.equal(suspendResponse.response.status, 200);
  assert.equal(suspendResponse.body.data.status, 'SUSPENDED');
  assert.ok(suspendResponse.body.data.suspendedAt);

  const blockedWorkspaceUpdate = await updateWorkspaceSettings(workspace.id, adminCookie, {
    runCooldownSeconds: 12,
  });

  assert.equal(blockedWorkspaceUpdate.response.status, 403);
  assert.equal(blockedWorkspaceUpdate.body.error.code, 'TENANT_INACTIVE');

  const softDeleteResponse = await updateTenantLifecycle(workspace.tenantId, adminCookie, {
    softDeleteAction: 'REQUEST',
    softDeleteGraceDays: 14,
  });

  assert.equal(softDeleteResponse.response.status, 200);
  assert.equal(softDeleteResponse.body.data.status, 'ARCHIVED');
  assert.ok(softDeleteResponse.body.data.softDeleteRequestedAt);
  assert.ok(softDeleteResponse.body.data.softDeleteScheduledFor);

  const blockedQuotaUpdate = await updateTenantQuotas(workspace.tenantId, adminCookie, {
    API_REQUESTS_PER_MINUTE: 5,
  });

  assert.equal(blockedQuotaUpdate.response.status, 403);
  assert.equal(blockedQuotaUpdate.body.error.code, 'TENANT_SOFT_DELETE_PENDING');

  const cancelResponse = await updateTenantLifecycle(workspace.tenantId, adminCookie, {
    softDeleteAction: 'CANCEL',
  });

  assert.equal(cancelResponse.response.status, 200);
  assert.equal(cancelResponse.body.data.status, 'ACTIVE');
  assert.equal(cancelResponse.body.data.softDeleteRequestedAt, null);
  assert.equal(cancelResponse.body.data.softDeleteScheduledFor, null);

  const resumedWorkspaceUpdate = await updateWorkspaceSettings(workspace.id, adminCookie, {
    runCooldownSeconds: 12,
  });

  assert.equal(resumedWorkspaceUpdate.response.status, 200);
  assert.equal(resumedWorkspaceUpdate.body.data.runCooldownSeconds, 12);

  const lifecycleEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: workspace.tenantId,
      entityId: workspace.tenantId,
      eventType: {
        in: ['tenant.status_updated', 'tenant.soft_delete_requested', 'tenant.soft_delete_canceled'],
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  assert.deepEqual(
    lifecycleEvents.map((event) => event.eventType),
    ['tenant.status_updated', 'tenant.soft_delete_requested', 'tenant.soft_delete_canceled'],
  );

  const exportAuditEvent = await prisma.auditEvent.findFirst({
    where: {
      tenantId: workspace.tenantId,
      eventType: 'tenant.export_requested',
    },
  });

  assert.ok(exportAuditEvent, 'Expected tenant export requests to be audited.');
});

test('tenant API rate limit blocks excess authenticated requests and returns headers', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const updateResponse = await updateTenantQuotas(workspace.tenantId, adminCookie, {
    API_REQUESTS_PER_MINUTE: 3,
  });

  assert.equal(updateResponse.response.status, 200);

  const firstRequest = await requestJson(`/api/v1/workspaces/${workspace.id}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(firstRequest.response.status, 200);
  assert.equal(firstRequest.response.headers.get('x-ratelimit-limit'), '3');
  assert.equal(firstRequest.response.headers.get('x-ratelimit-remaining'), '1');
  assert.ok(firstRequest.response.headers.get('x-ratelimit-reset'));

  const secondRequest = await requestJson(`/api/v1/workspaces/${workspace.id}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(secondRequest.response.status, 200);
  assert.equal(secondRequest.response.headers.get('x-ratelimit-remaining'), '0');

  const blockedRequest = await requestJson(`/api/v1/workspaces/${workspace.id}`, {
    headers: { cookie: adminCookie },
  });

  assert.equal(blockedRequest.response.status, 429);
  assert.equal(blockedRequest.body.error.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(blockedRequest.response.headers.get('retry-after'), '60');
  assert.equal(blockedRequest.response.headers.get('x-ratelimit-limit'), '3');
  assert.equal(blockedRequest.response.headers.get('x-ratelimit-remaining'), '0');
});

test('tenant run count quota blocks creating additional runs', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.testRunItem.deleteMany({ where: { testRun: { workspaceId: workspace.id } } });
  await prisma.testRun.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.workspace.update({ where: { id: workspace.id }, data: { concurrentExecutionLimit: 5 } });

  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: workspace.tenantId, metricType: 'RUN_COUNT' } },
    update: { limitValue: 1 },
    create: {
      tenantId: workspace.tenantId,
      metricType: 'RUN_COUNT',
      limitValue: 1,
    },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'run-quota-recording.ts',
      originalPath: 'run-quota-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/run-quota-recording.ts`,
      checksum: 'run-quota-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'quota protected run test',
      definitionJson: { flow: 'quota' },
      status: 'VALIDATED',
    },
  });

  await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'quota-run.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-quota-run.spec.ts`,
      checksum: 'quota-run-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'PASSED',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: [canonicalTest.id],
  });

  assert.equal(creation.response.status, 400);
  assert.equal(creation.body.error.code, 'QUOTA_EXCEEDED');
  assert.equal(creation.body.error.details.metricType, 'RUN_COUNT');
});

test('tenant concurrent execution quota blocks additional runs', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  await prisma.testRunItem.deleteMany({ where: { testRun: { workspaceId: workspace.id } } });
  await prisma.testRun.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.workspace.update({ where: { id: workspace.id }, data: { concurrentExecutionLimit: 5 } });

  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: workspace.tenantId, metricType: 'CONCURRENT_EXECUTIONS' } },
    update: { limitValue: 1 },
    create: {
      tenantId: workspace.tenantId,
      metricType: 'CONCURRENT_EXECUTIONS',
      limitValue: 1,
    },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'concurrent-quota-recording.ts',
      originalPath: 'concurrent-quota-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/concurrent-quota-recording.ts`,
      checksum: 'concurrent-quota-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'tenant concurrent quota test',
      definitionJson: { flow: 'concurrent-quota' },
      status: 'VALIDATED',
    },
  });

  await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'concurrent-quota.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-concurrent-quota.spec.ts`,
      checksum: 'concurrent-quota-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'RUNNING',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 1,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date(),
    },
  });

  const creation = await createRun(workspace.id, operatorCookie, {
    environmentId: environment.id,
    testIds: [canonicalTest.id],
  });

  assert.equal(creation.response.status, 400);
  assert.equal(creation.body.error.code, 'QUOTA_EXCEEDED');
  assert.equal(creation.body.error.details.metricType, 'CONCURRENT_EXECUTIONS');
});

test('tenant artifact storage quota blocks recording uploads', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: workspace.tenantId, metricType: 'ARTIFACT_STORAGE_BYTES' } },
    update: { limitValue: 10 },
    create: {
      tenantId: workspace.tenantId,
      metricType: 'ARTIFACT_STORAGE_BYTES',
      limitValue: 10,
    },
  });

  const recordingContent = `
import { test } from '@playwright/test';
test('quota upload', async ({ page }) => {
  await page.goto('https://example.com');
});
`;

  const upload = await uploadRecording(workspace.id, operatorCookie, recordingContent, 'quota-blocked.ts');

  assert.equal(upload.response.status, 400);
  assert.equal(upload.body.error.code, 'QUOTA_EXCEEDED');
  assert.equal(upload.body.error.details.metricType, 'ARTIFACT_STORAGE_BYTES');
});

test('tenant seat quota blocks inviting a new member', async () => {
  const adminCookie = await login('admin@selora.local', 'admin123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: workspace.tenantId, metricType: 'USER_SEATS' } },
    update: { limitValue: 2 },
    create: {
      tenantId: workspace.tenantId,
      metricType: 'USER_SEATS',
      limitValue: 2,
    },
  });

  const createMembershipResponse = await requestJson(`/api/v1/workspaces/${workspace.id}/memberships`, {
    method: 'POST',
    headers: {
      cookie: adminCookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'new-user@selora.local',
      name: 'Quota Blocked User',
      role: 'WORKSPACE_VIEWER',
    }),
  });

  assert.equal(createMembershipResponse.response.status, 400);
  assert.equal(createMembershipResponse.body.error.code, 'QUOTA_EXCEEDED');
  assert.equal(createMembershipResponse.body.error.details.metricType, 'USER_SEATS');
});

test('run comparison and searchable run history expose Sprint 7 run analysis features', async () => {
  const operatorCookie = await login('operator@selora.local', 'operator123');
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator@selora.local' } });
  const environment = await prisma.environment.findFirstOrThrow({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  const recordingAsset = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'comparison-recording.ts',
      originalPath: 'comparison-recording.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/comparison-recording.ts`,
      checksum: 'comparison-recording-checksum',
      version: 1,
      status: 'NORMALIZED',
      uploadedByUserId: operator.id,
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recordingAsset.id,
      name: 'comparison smoke test',
      definitionJson: { flow: 'compare' },
      status: 'VALIDATED',
    },
  });

  const generatedArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'comparison.spec.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/generated-tests/v1-comparison.spec.ts`,
      checksum: 'comparison-generated-checksum',
      generatorVersion: 'integration-test',
      status: 'READY',
      createdByUserId: operator.id,
    },
  });

  const runA = await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'PASSED',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date(Date.now() - 5000),
      finishedAt: new Date(Date.now() - 3000),
      items: {
        create: {
          canonicalTestId: canonicalTest.id,
          generatedTestArtifactId: generatedArtifact.id,
          sequence: 1,
          status: 'PASSED',
          startedAt: new Date(Date.now() - 5000),
          finishedAt: new Date(Date.now() - 3000),
        },
      },
    },
  });

  const runB = await prisma.testRun.create({
    data: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      environmentId: environment.id,
      triggeredByUserId: operator.id,
      runType: 'MANUAL',
      status: 'FAILED',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 0,
      failedCount: 1,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date(Date.now() - 2000),
      finishedAt: new Date(Date.now() - 1000),
      items: {
        create: {
          canonicalTestId: canonicalTest.id,
          generatedTestArtifactId: generatedArtifact.id,
          sequence: 1,
          status: 'FAILED',
          startedAt: new Date(Date.now() - 2000),
          finishedAt: new Date(Date.now() - 1000),
          failureSummary: 'Expected failure for comparison',
        },
      },
    },
  });

  const comparison = await requestJson(
    `/api/v1/workspaces/${workspace.id}/runs/compare?runIdA=${runA.id}&runIdB=${runB.id}`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(comparison.response.status, 200);
  assert.equal(comparison.body.data.summary.changedCount, 1);
  assert.equal(comparison.body.data.comparisons[0].testName, 'comparison smoke test');
  assert.equal(comparison.body.data.comparisons[0].changed, true);
  assert.equal(comparison.body.data.comparisons[0].runA.status, 'PASSED');
  assert.equal(comparison.body.data.comparisons[0].runB.status, 'FAILED');

  const searchableRuns = await requestJson(
    `/api/v1/workspaces/${workspace.id}/runs?search=comparison%20smoke&triggeredBy=operator&sortBy=status`,
    {
      headers: { cookie: operatorCookie },
    },
  );

  assert.equal(searchableRuns.response.status, 200);
  assert.ok(searchableRuns.body.data.items.some((item) => item.id === runA.id));
  assert.ok(searchableRuns.body.data.items.some((item) => item.id === runB.id));
});
