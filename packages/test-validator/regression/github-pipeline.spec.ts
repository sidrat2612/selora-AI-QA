import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';

type ApiResponse = {
  status: number;
  body: Record<string, unknown>;
  cookie: string | null;
};

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData,
  cookie?: string,
): Promise<ApiResponse> {
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookie = response.headers.get('set-cookie')?.split(';')[0] ?? null;
  const text = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  return { status: response.status, body: parsed, cookie: setCookie };
}

let sessionCookie: string;
let workspaceId: string;
let suiteId: string;

test.beforeAll(async () => {
  const login = await apiRequest('POST', '/api/v1/auth/login', {
    email: process.env['REGRESSION_EMAIL'] ?? 'admin@selora.local',
    password: process.env['REGRESSION_PASSWORD'] ?? 'admin123',
  });
  expect(login.status).toBe(201);
  sessionCookie = login.cookie!;
  expect(sessionCookie).toBeTruthy();

  const data = login.body as { data: { user: { memberships: Array<{ workspaceId: string }> } } };
  workspaceId = data.data.user.memberships[0]!.workspaceId;
  expect(workspaceId).toBeTruthy();

  // Create a dedicated suite for pipeline tests
  const suiteRes = await apiRequest(
    'POST',
    `/api/v1/workspaces/${workspaceId}/suites`,
    { name: `Pipeline Regression ${Date.now()}` },
    sessionCookie,
  );
  expect(suiteRes.status).toBe(201);
  const suiteData = (suiteRes.body as { data: { id: string } }).data;
  suiteId = suiteData.id;
});

test.afterAll(async () => {
  if (suiteId) {
    await apiRequest('DELETE', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}`, undefined, sessionCookie);
  }
});

test.describe('GitHub pipeline flow', () => {
  let recordingId: string;
  let canonicalTestId: string;

  test('upload a recording creates an asset and enqueues ingestion', async () => {
    const sampleRecording = `
import { test, expect } from '@playwright/test';

test('verify homepage loads', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toContainText('Example');
});
`.trim();

    const formData = new FormData();
    formData.append('file', new Blob([sampleRecording], { type: 'text/plain' }), 'homepage-check.spec.ts');

    const res = await apiRequest(
      'POST',
      `/api/v1/workspaces/${workspaceId}/recordings`,
      formData,
      sessionCookie,
    );
    expect(res.status).toBe(201);
    const data = (res.body as { data: { recordingId: string; status: string; queued: boolean } }).data;
    expect(data.recordingId).toBeTruthy();
    expect(data.status).toBe('UPLOADED');
    expect(data.queued).toBe(true);
    recordingId = data.recordingId;
  });

  test('wait for ingestion to complete and produce a canonical test', async () => {
    // Poll tests list until a canonical test appears for this workspace
    let found = false;
    for (let i = 0; i < 30; i++) {
      const res = await apiRequest(
        'GET',
        `/api/v1/workspaces/${workspaceId}/tests?pageSize=50`,
        undefined,
        sessionCookie,
      );
      expect(res.status).toBe(200);
      const items = ((res.body as { data: { items: Array<Record<string, unknown>> } }).data?.items) ??
        ((res.body as { data: Array<Record<string, unknown>> }).data);
      if (Array.isArray(items) && items.length > 0) {
        // Find the most recent test
        const latest = items[0];
        if (latest && typeof latest['id'] === 'string') {
          canonicalTestId = latest['id'] as string;
          found = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(found).toBe(true);
    expect(canonicalTestId).toBeTruthy();
  });

  test('canonical test has expected fields', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/tests/${canonicalTestId}`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data['id']).toBe(canonicalTestId);
    expect(data['status']).toBeTruthy();
    expect(data['name']).toBeTruthy();
  });

  test('generate a Playwright test from the canonical test', async () => {
    const res = await apiRequest(
      'POST',
      `/api/v1/workspaces/${workspaceId}/tests/${canonicalTestId}/generate`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(201);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data['artifactId']).toBeTruthy();
    expect(data['version']).toBe(1);
  });

  test('re-recording creates a new version via canonicalTestId', async () => {
    const updatedRecording = `
import { test, expect } from '@playwright/test';

test('verify homepage loads with updated check', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toContainText('Example Domain');
  await expect(page).toHaveTitle(/Example/);
});
`.trim();

    const formData = new FormData();
    formData.append('file', new Blob([updatedRecording], { type: 'text/plain' }), 'homepage-check-v2.spec.ts');
    formData.append('canonicalTestId', canonicalTestId);

    const res = await apiRequest(
      'POST',
      `/api/v1/workspaces/${workspaceId}/recordings`,
      formData,
      sessionCookie,
    );
    expect(res.status).toBe(201);
    const data = (res.body as { data: { recordingId: string; queued: boolean } }).data;
    expect(data.recordingId).toBeTruthy();
    expect(data.queued).toBe(true);

    // Wait for ingestion to process
    await new Promise((r) => setTimeout(r, 5000));

    // Verify the canonical test was updated (not duplicated)
    const testRes = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/tests/${canonicalTestId}`,
      undefined,
      sessionCookie,
    );
    expect(testRes.status).toBe(200);
    const testData = (testRes.body as { data: Record<string, unknown> }).data;
    expect(testData['id']).toBe(canonicalTestId);
    // canonicalVersion should have been incremented
    const version = testData['canonicalVersion'] as number;
    expect(version).toBeGreaterThanOrEqual(2);
  });

  test('list tests includes publication info in artifacts', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/tests?pageSize=50`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const body = res.body as { data: { items: Array<Record<string, unknown>> } | Array<Record<string, unknown>> };
    const items = Array.isArray(body.data) ? body.data : (body.data as { items: Array<Record<string, unknown>> }).items;
    expect(items).toBeTruthy();
    expect(items.length).toBeGreaterThan(0);

    // Find our test
    const ourTest = items.find((t) => t['id'] === canonicalTestId);
    expect(ourTest).toBeTruthy();

    // Check that generatedArtifacts have a publication field (may or may not be populated)
    const artifacts = ourTest!['generatedArtifacts'] as Array<Record<string, unknown>> | undefined;
    if (artifacts && artifacts.length > 0) {
      // publication should be present as a key (may be null if not published)
      expect('publication' in artifacts[0]!).toBe(true);
    }
  });
});
