const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, '../../..');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';
const localStorageDir = path.join(repoRoot, '.tmp', 'ai-repair-tests-storage');
const validationHostRoot = repoRoot;

let repairModule;
let server;
let baseUrl;

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
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  server = undefined;
  baseUrl = undefined;
  fs.rmSync(localStorageDir, { recursive: true, force: true });
  seedDatabase();
  await startFixtureServer();
}

async function startFixtureServer() {
  server = http.createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`
      <html>
        <body>
          <button type="button">Submit order</button>
          <button type="button">Submit order</button>
          <div id="done" hidden>Done</div>
          <script>
            const buttons = document.querySelectorAll('button');
            const done = document.getElementById('done');
            buttons.forEach((button, index) => {
              button.addEventListener('click', () => {
                if (index === 0) {
                  done.hidden = false;
                }
              });
            });
          </script>
        </body>
      </html>
    `);
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }

      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve fixture server address.'));
        return;
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function prepareGeneratedArtifact({ withExistingAttempt = false } = {}) {
  const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const user = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });

  const environment = await prisma.environment.findFirst({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  if (environment) {
    await prisma.environment.update({
      where: { id: environment.id },
      data: { baseUrl },
    });
  } else {
    await prisma.environment.create({
      data: {
        workspaceId: workspace.id,
        name: 'Fixture',
        baseUrl,
        secretRef: 'fixture',
        isDefault: true,
      },
    });
  }

  const recording = await prisma.recordingAsset.create({
    data: {
      workspaceId: workspace.id,
      sourceType: 'PLAYWRIGHT_CODEGEN_TS',
      filename: 'repair-source.ts',
      storageKey: `${workspace.tenantId}/${workspace.id}/recordings/repair-source.ts`,
      checksum: 'recording-checksum',
      uploadedByUserId: user.id,
      status: 'NORMALIZED',
    },
  });

  const canonicalTest = await prisma.canonicalTest.create({
    data: {
      workspaceId: workspace.id,
      recordingAssetId: recording.id,
      name: withExistingAttempt ? 'repair with existing attempt' : 'repair strict mode violation',
      definitionJson: {
        steps: [],
      },
      status: 'VALIDATING',
    },
  });

  const originalCode = `
import { test, expect } from '@playwright/test';

test('strict mode repair target', async ({ page }) => {
  await page.goto('${baseUrl}');
  await page.getByRole('button', { name: 'Submit order' }).click();
  await expect(page.getByText('Done')).toBeVisible();
});
`.trim();

  const storageKey = `${workspace.tenantId}/${workspace.id}/generated-tests/v1-strict-mode.spec.ts`;
  const filePath = path.join(localStorageDir, storageKey);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, originalCode);

  const generatedArtifact = await prisma.generatedTestArtifact.create({
    data: {
      workspaceId: workspace.id,
      canonicalTestId: canonicalTest.id,
      version: 1,
      fileName: 'strict-mode.spec.ts',
      storageKey,
      checksum: 'generated-checksum',
      generatorVersion: 'test-generator',
      status: 'FAILED',
      createdByUserId: user.id,
      metadataJson: {
        validation: {
          mode: 'playwright',
          ok: false,
          summary: 'strict mode violation',
          failureContext: {
            errorClass: 'PLAYWRIGHT_STRICT_MODE',
            message: 'locator.click: Error: strict mode violation: getByRole(\'button\', { name: \'Submit order\' }) resolved to 2 elements',
            failingStep: 'click submit button',
            timeoutMs: 15000,
            baseUrl,
          },
        },
      },
    },
  });

  if (withExistingAttempt) {
    await prisma.aIRepairAttempt.create({
      data: {
        workspaceId: workspace.id,
        canonicalTestId: canonicalTest.id,
        generatedTestArtifactId: generatedArtifact.id,
        attemptNumber: 1,
        repairMode: 'RULE_BASED',
        inputFailureHash: 'previous-attempt',
        promptVersion: 'rule-based-v1',
        status: 'RERUN_FAILED',
        diffSummary: 'Previous repair attempt failed.',
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
  }

  return { workspace, user, canonicalTest, generatedArtifact };
}

test.before(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.STORAGE_DRIVER = 'local';
  process.env.LOCAL_STORAGE_DIR = localStorageDir;
  process.env.VALIDATION_TIMEOUT_MS = '15000';
  configureInlineDockerValidation();
  ensurePlaywrightRunnerImage();
  delete process.env.AI_PROVIDER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_PROVIDER_API_URL;
  repairModule = await import('../dist/index.js');
  await resetState();
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await prisma.$disconnect();
  fs.rmSync(localStorageDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await resetState();
});

test('processRepairJob auto-repairs a strict-mode selector failure and revalidates the patched artifact', async () => {
  const { workspace, user, canonicalTest, generatedArtifact } = await prepareGeneratedArtifact();

  const result = await repairModule.processRepairJob({
    prisma,
    job: {
      generatedTestArtifactId: generatedArtifact.id,
      canonicalTestId: canonicalTest.id,
      workspaceId: workspace.id,
      tenantId: workspace.tenantId,
      actorUserId: user.id,
      requestId: 'repair-test-1',
    },
  });

  assert.equal(result.status, 'RERUN_PASSED');

  const persistedTest = await prisma.canonicalTest.findUniqueOrThrow({
    where: { id: canonicalTest.id },
    include: {
      generatedArtifacts: { orderBy: { version: 'asc' } },
      aiRepairAttempts: { orderBy: { attemptNumber: 'asc' } },
    },
  });

  assert.equal(persistedTest.status, 'AUTO_REPAIRED');
  assert.equal(persistedTest.aiRepairAttempts.length, 1);
  assert.equal(persistedTest.aiRepairAttempts[0].attemptNumber, 1);
  assert.equal(persistedTest.aiRepairAttempts[0].status, 'RERUN_PASSED');
  assert.equal(persistedTest.generatedArtifacts.length, 2);
  assert.equal(persistedTest.generatedArtifacts[1].status, 'READY');

  const repairedFilePath = path.join(localStorageDir, persistedTest.generatedArtifacts[1].storageKey);
  const repairedCode = fs.readFileSync(repairedFilePath, 'utf8');
  assert.match(repairedCode, /first\(\)\.click\(/);

  const diffArtifact = await prisma.artifact.findFirst({
    where: {
      generatedTestArtifactId: generatedArtifact.id,
      artifactType: 'REPAIR_DIFF',
    },
  });
  assert.ok(diffArtifact, 'Expected a repair diff artifact on the original generated artifact.');
});

test('processRepairJob uses the remaining attempt budget instead of reusing attempt number 1', async () => {
  const { workspace, user, canonicalTest, generatedArtifact } = await prepareGeneratedArtifact({ withExistingAttempt: true });

  const result = await repairModule.processRepairJob({
    prisma,
    job: {
      generatedTestArtifactId: generatedArtifact.id,
      canonicalTestId: canonicalTest.id,
      workspaceId: workspace.id,
      tenantId: workspace.tenantId,
      actorUserId: user.id,
      requestId: 'repair-test-2',
    },
  });

  assert.equal(result.status, 'RERUN_PASSED');

  const attempts = await prisma.aIRepairAttempt.findMany({
    where: { generatedTestArtifactId: generatedArtifact.id },
    orderBy: { attemptNumber: 'asc' },
  });

  assert.deepEqual(attempts.map((attempt) => attempt.attemptNumber), [1, 2]);
  assert.equal(attempts[1].status, 'RERUN_PASSED');
});

test('rule-based repair classifies and patches timeout failures', async () => {
  const failureContext = {
    errorClass: 'TimeoutError',
    message: 'waiting for locator timed out after 5000ms',
    timeoutMs: 5000,
  };
  const sourceCode = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('timeout repair', async ({ page }) => {",
    "  await page.goto('http://example.test');",
    "  await expect(page.getByText('Done')).toBeVisible();",
    '});',
  ].join('\n');

  const failureClass = repairModule.classifyFailure(failureContext);
  const candidate = repairModule.applyRuleBasedRepair({ code: sourceCode, failureContext });

  assert.equal(failureClass, 'TIMEOUT');
  assert.ok(candidate);
  assert.match(candidate.code, /waitForLoadState\('networkidle'\)/);
  assert.match(candidate.code, /toBeVisible\(\{ timeout: 15000 \}\)/);
});

test('rule-based repair treats strict-mode traces with waiting-for text as selector failures', async () => {
  const failureContext = {
    errorClass: 'PLAYWRIGHT_VALIDATION_FAILED',
    message: [
      "Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Submit order' }) resolved to 2 elements:",
      "Call log:",
      "  - waiting for getByRole('button', { name: 'Submit order' })",
    ].join('\n'),
    timeoutMs: 45000,
  };
  const sourceCode = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('selector repair', async ({ page }) => {",
    "  await page.getByRole('button', { name: 'Submit order' }).click();",
    "  await expect(page.getByRole('button', { name: 'Submit order' })).toBeVisible();",
    '});',
  ].join('\n');

  const failureClass = repairModule.classifyFailure(failureContext);
  const candidate = repairModule.applyRuleBasedRepair({ code: sourceCode, failureContext });

  assert.equal(failureClass, 'SELECTOR');
  assert.ok(candidate);
  assert.match(candidate.diffSummary, /selector repair/i);
  assert.match(candidate.code, /first\(\)\.click\(/);
  assert.match(candidate.code, /expect\(page\.getByRole\('button', \{ name: 'Submit order' \}\)\.first\(\)\)\.toBeVisible\(/);
});

test('rule-based repair treats expect visibility timeout traces with getByText as timeout failures', async () => {
  const failureContext = {
    errorClass: 'PLAYWRIGHT_VALIDATION_FAILED',
    message: [
      'Error: expect(locator).toBeVisible() failed',
      '',
      "Locator: getByText('Loaded')",
      'Expected: visible',
      'Timeout: 5000ms',
      'Error: element(s) not found',
      '',
      'Call log:',
      '  - Expect "toBeVisible" with timeout 5000ms',
      "  - waiting for getByText('Loaded')",
      '',
      "  3 | test('timeout repair', async ({ page }) => {",
      "  4 |   await page.goto('http://example.test/timeout');",
      "> 5 |   await expect(page.getByText('Loaded')).toBeVisible();",
    ].join('\n'),
    timeoutMs: 45000,
  };
  const sourceCode = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('timeout repair', async ({ page }) => {",
    "  await page.goto('http://example.test/timeout');",
    "  await expect(page.getByText('Loaded')).toBeVisible();",
    '});',
  ].join('\n');

  const failureClass = repairModule.classifyFailure(failureContext);
  const candidate = repairModule.applyRuleBasedRepair({ code: sourceCode, failureContext });

  assert.equal(failureClass, 'TIMEOUT');
  assert.ok(candidate);
  assert.match(candidate.diffSummary, /timeout repair/i);
  assert.match(candidate.code, /waitForLoadState\('networkidle'\)/);
  assert.match(candidate.code, /toBeVisible\(\{ timeout: 15000 \}\)/);
});

test('rule-based repair classifies and patches navigation failures', async () => {
  const failureContext = {
    errorClass: 'NavigationError',
    message: 'navigation failed because the page redirected unexpectedly',
    timeoutMs: 5000,
  };
  const sourceCode = [
    "import { test } from '@playwright/test';",
    '',
    "test('navigation repair', async ({ page }) => {",
    "  await page.goto('http://example.test');",
    "  await page.getByRole('button', { name: 'Continue' }).click();",
    '});',
  ].join('\n');

  const failureClass = repairModule.classifyFailure(failureContext);
  const candidate = repairModule.applyRuleBasedRepair({ code: sourceCode, failureContext });

  assert.equal(failureClass, 'NAVIGATION');
  assert.ok(candidate);
  assert.match(candidate.code, /waitForLoadState\('networkidle'\)/);
});

test('rule-based repair classifies and patches assertion failures', async () => {
  const failureContext = {
    errorClass: 'ExpectationError',
    message: 'Expected "Order confirmed" but received "Order complete"',
    timeoutMs: 5000,
  };
  const sourceCode = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('assertion repair', async ({ page }) => {",
    "  await expect(page.getByText('Order confirmed')).toHaveText('Order confirmed');",
    '});',
  ].join('\n');

  const failureClass = repairModule.classifyFailure(failureContext);
  const candidate = repairModule.applyRuleBasedRepair({ code: sourceCode, failureContext });

  assert.equal(failureClass, 'ASSERTION');
  assert.ok(candidate);
  assert.match(candidate.code, /Order complete/);
});