import { expect, test } from '@playwright/test';

const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';

type ApiResponse = {
  status: number;
  body: Record<string, unknown>;
  cookie: string | null;
};

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  cookie?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

  // Get first suite
  const suites = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/suites`, undefined, sessionCookie);
  expect(suites.status).toBe(200);
  const suitesData = suites.body as { data: Array<{ id: string }> };
  expect(suitesData.data.length).toBeGreaterThan(0);
  suiteId = suitesData.data[0]!.id;
});

test.describe('business test case CRUD', () => {
  let testCaseId: string;

  test('list test cases returns 200', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray((res.body as { data: unknown[] }).data)).toBe(true);
  });

  test('create test case returns 201 with correct data', async () => {
    const res = await apiRequest(
      'POST',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`,
      {
        title: 'Regression: Checkout flow',
        description: 'Verify full checkout from cart to confirmation',
        format: 'SIMPLE',
        priority: 'HIGH',
        preconditions: 'Products exist in cart',
        expectedResult: 'Order confirmation page shown with order ID',
      },
      sessionCookie,
    );
    expect(res.status).toBe(201);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty('id');
    expect(data['title']).toBe('Regression: Checkout flow');
    expect(data['priority']).toBe('HIGH');
    expect(data['format']).toBe('SIMPLE');
    expect(data['status']).toBe('ACTIVE');
    expect(data['source']).toBe('MANUAL');
    testCaseId = data['id'] as string;
  });

  test('get test case detail returns 200', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data['id']).toBe(testCaseId);
    expect(data['preconditions']).toBe('Products exist in cart');
    expect(data['expectedResult']).toBe('Order confirmation page shown with order ID');
  });

  test('update test case changes priority', async () => {
    const res = await apiRequest(
      'PATCH',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`,
      { priority: 'CRITICAL', description: 'Updated description' },
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data['priority']).toBe('CRITICAL');
    expect(data['description']).toBe('Updated description');
  });

  test('list mappings returns empty array', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}/mappings`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const data = (res.body as { data: unknown[] }).data;
    expect(data).toEqual([]);
  });

  test('archive (delete) test case sets status to ARCHIVED', async () => {
    const res = await apiRequest(
      'DELETE',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);

    // Verify status is ARCHIVED
    const detail = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${testCaseId}`,
      undefined,
      sessionCookie,
    );
    expect(detail.status).toBe(200);
    const data = (detail.body as { data: Record<string, unknown> }).data;
    expect(data['status']).toBe('ARCHIVED');
  });

  test('create test case with invalid priority returns 400', async () => {
    const res = await apiRequest(
      'POST',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`,
      {
        title: 'Bad priority test',
        priority: 'INVALID_PRIORITY',
      },
      sessionCookie,
    );
    expect(res.status).toBe(400);
  });

  test('create test case without title returns 400', async () => {
    const res = await apiRequest(
      'POST',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`,
      {
        description: 'No title provided',
      },
      sessionCookie,
    );
    expect(res.status).toBe(400);
  });

  test('get non-existent test case returns 404', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/00000000-0000-0000-0000-000000000000`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(404);
  });
});

test.describe('suite screenshot policy', () => {
  test('suite has screenshotPolicy field', async () => {
    const res = await apiRequest(
      'GET',
      `/api/v1/workspaces/${workspaceId}/suites/${suiteId}`,
      undefined,
      sessionCookie,
    );
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty('screenshotPolicy');
    expect(['ALWAYS', 'ON_FAIL_ONLY', 'NEVER']).toContain(data['screenshotPolicy']);
  });
});
