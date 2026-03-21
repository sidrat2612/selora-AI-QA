const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRecordingUpload,
  analyzeRecordingToCanonical,
  analyzeRecordingSupport,
} = require('../dist/index.js');

test('validateRecordingUpload accepts named page variables from fixtures', () => {
  const content = `
import { test } from '@playwright/test';

test('fixture page', async ({ adminPage, page }) => {
  await adminPage.goto('https://example.com/admin');
  await adminPage.getByRole('button', { name: 'Save' }).click();
});
`;

  const validated = validateRecordingUpload({
    filename: 'fixture-page.ts',
    size: Buffer.byteLength(content),
    content,
  });

  assert.equal(validated.filename, 'fixture-page.ts');
});

test('analyzeRecordingSupport classifies supported and deferred patterns', () => {
  const content = `
import { test } from '@playwright/test';

const users = ['a', 'b'];
async function loginAs(page, email) { await page.goto('/login'); }

users.forEach((user) => {
  test('parameterized', async ({ page, adminPage }) => {
    const detailPage = await page.context().newPage();
    await loginAs(page, user);
    await detailPage.goto('https://example.com/detail');
    await adminPage.getByRole('button', { name: 'Approve' }).click();
  });
});
`;

  const summary = analyzeRecordingSupport(content);
  assert.equal(summary.findings.some((item) => item.pattern === 'multi_page_tests'), true);
  assert.equal(summary.findings.some((item) => item.pattern === 'fixtures'), true);
  assert.equal(summary.findings.some((item) => item.pattern === 'parametrized_tests'), true);
  assert.equal(summary.findings.some((item) => item.pattern === 'custom_helpers'), true);
  assert.equal(summary.recommendedOutcome, 'parser_extension_required');
});

test('analyzeRecordingToCanonical extracts actions from named page variables and helper calls', async () => {
  const content = `
import { test, expect } from '@playwright/test';

async function seedAccount(adminPage) {
  await adminPage.goto('https://example.com/admin');
}

test('multi page flow', async ({ page, adminPage }) => {
  const detailPage = await page.context().newPage();
  await seedAccount(adminPage);
  await detailPage.goto('https://example.com/detail');
  await adminPage.getByRole('button', { name: 'Approve' }).click();
  await expect(detailPage.getByText('Approved')).toBeVisible();
});
`;

  const result = await analyzeRecordingToCanonical({
    filename: 'multi-page.ts',
    content,
    checksum: 'abc123',
  });

  assert.equal(result.metadata.supportSummary.findings.some((item) => item.pattern === 'multi_page_tests'), true);
  assert.equal(result.definition.actions.some((action) => action.type === 'navigate'), true);
  assert.equal(result.definition.actions.some((action) => action.type === 'click'), true);
  assert.equal(result.definition.actions.some((action) => action.type === 'unknown' && /seedAccount/.test(action.label)), true);
});