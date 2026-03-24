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

async function loginWithRetry(email: string, password: string): Promise<ApiResponse> {
  let login!: ApiResponse;
  for (let attempt = 0; attempt < 5; attempt++) {
    login = await apiRequest('POST', '/api/v1/auth/login', { email, password });
    if (login.status !== 429) return login;
    await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
  }
  return login;
}

// ─── Shared state ────────────────────────────────────────────────────────────

let viewerCookie: string;
let operatorCookie: string;
let adminCookie: string;
let workspaceId: string;
let suiteId: string;
let environmentId: string;

// Flat describe — NO nested describes — so beforeAll runs exactly once
test.describe('role-based authorization', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const adminLogin = await loginWithRetry('admin@selora.local', 'admin123');
    expect(adminLogin.status).toBe(201);
    adminCookie = adminLogin.cookie!;

    const adminData = adminLogin.body as { data: { user: { memberships: Array<{ workspaceId: string | null }> } } };
    workspaceId = adminData.data.user.memberships.find(m => m.workspaceId != null)!.workspaceId!;

    await new Promise(r => setTimeout(r, 2000));
    const opLogin = await loginWithRetry('operator@selora.local', 'operator123');
    expect(opLogin.status).toBe(201);
    operatorCookie = opLogin.cookie!;

    await new Promise(r => setTimeout(r, 2000));
    const viewerLogin = await loginWithRetry('viewer@selora.local', 'viewer123');
    expect(viewerLogin.status).toBe(201);
    viewerCookie = viewerLogin.cookie!;

    // Get a suite
    const suites = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/suites`, undefined, adminCookie);
    expect(suites.status).toBe(200);
    const suitesData = suites.body as { data: Array<{ id: string }> };
    expect(suitesData.data.length).toBeGreaterThan(0);
    suiteId = suitesData.data[0]!.id;

    // Get an environment
    const envs = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/environments`, undefined, adminCookie);
    expect(envs.status).toBe(200);
    const envsData = envs.body as { data: Array<{ id: string }> };
    if (envsData.data.length > 0) {
      environmentId = envsData.data[0]!.id;
    }
  });

  // ─── VIEWER: Read-only ──────────────────────────────────────────────────

  test('VIEWER can list suites', async () => {
    const res = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/suites`, undefined, viewerCookie);
    expect(res.status).toBe(200);
  });

  test('VIEWER can list tests', async () => {
    const res = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/tests`, undefined, viewerCookie);
    expect(res.status).toBe(200);
  });

  test('VIEWER can list runs', async () => {
    const res = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/runs`, undefined, viewerCookie);
    expect(res.status).toBe(200);
  });

  test('VIEWER cannot create suite', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/suites`, { name: 'Viewer Suite' }, viewerCookie);
    expect(res.status).toBe(403);
  });

  test('VIEWER cannot create test case', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`, { title: 'Viewer TC' }, viewerCookie);
    expect(res.status).toBe(403);
  });

  test('VIEWER cannot create run', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/runs`, { suiteId, environmentId }, viewerCookie);
    expect(res.status).toBe(403);
  });

  test('VIEWER cannot update suite', async () => {
    const res = await apiRequest('PATCH', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}`, { name: 'X' }, viewerCookie);
    expect(res.status).toBe(403);
  });

  test('VIEWER cannot invite members', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/memberships`, { name: 'F', email: 'f@t.l', role: 'TENANT_VIEWER' }, viewerCookie);
    expect(res.status).toBe(403);
  });

  test('VIEWER cannot create environment', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/environments`, { name: 'E', baseUrl: 'http://x', secretRef: 'ref' }, viewerCookie);
    expect(res.status).toBe(403);
  });

  // ─── OPERATOR: Author + Operate ────────────────────────────────────────

  let opTestCaseId: string;

  test('OPERATOR can create suite', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/suites`, { name: `Op Suite ${Date.now()}` }, operatorCookie);
    expect(res.status).toBe(201);
  });

  test('OPERATOR can create test case', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`, { title: `Op TC ${Date.now()}` }, operatorCookie);
    expect(res.status).toBe(201);
    const data = res.body as { data: { id: string } };
    opTestCaseId = data.data.id;
  });

  test('OPERATOR can update test case', async () => {
    const res = await apiRequest('PATCH', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${opTestCaseId}`, { priority: 'HIGH' }, operatorCookie);
    expect(res.status).toBe(200);
  });

  test('OPERATOR can archive test case', async () => {
    const res = await apiRequest('DELETE', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${opTestCaseId}`, undefined, operatorCookie);
    expect(res.status).toBe(200);
  });

  test('OPERATOR cannot invite members', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/memberships`, { name: 'F', email: 'f2@t.l', role: 'TENANT_VIEWER' }, operatorCookie);
    expect(res.status).toBe(403);
  });

  test('OPERATOR cannot create environment', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/environments`, { name: 'E', baseUrl: 'http://x', secretRef: 'ref' }, operatorCookie);
    expect(res.status).toBe(403);
  });

  test('OPERATOR cannot update retention', async () => {
    const res = await apiRequest('PATCH', `/api/v1/workspaces/${workspaceId}/settings/retention`, { logsDays: 30 }, operatorCookie);
    expect(res.status).toBe(403);
  });

  // ─── ADMIN: Full workspace management ──────────────────────────────────

  test('ADMIN can create environment', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/environments`, { name: `Admin Env ${Date.now()}`, baseUrl: 'http://admin.local', secretRef: `admin-ref-${Date.now()}` }, adminCookie);
    expect(res.status).toBe(201);
  });

  test('ADMIN can update retention', async () => {
    const res = await apiRequest('PATCH', `/api/v1/workspaces/${workspaceId}/settings/retention`, { logsDays: 30 }, adminCookie);
    expect(res.status).toBe(200);
  });

  test('ADMIN can list memberships', async () => {
    const res = await apiRequest('GET', `/api/v1/workspaces/${workspaceId}/memberships`, undefined, adminCookie);
    expect(res.status).toBe(200);
  });

  test('ADMIN can create suite', async () => {
    const res = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/suites`, { name: `Admin Suite ${Date.now()}` }, adminCookie);
    expect(res.status).toBe(201);
  });

  test('ADMIN can create and archive test case', async () => {
    const create = await apiRequest('POST', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases`, { title: `Admin TC ${Date.now()}` }, adminCookie);
    expect(create.status).toBe(201);
    const data = create.body as { data: { id: string } };
    const del = await apiRequest('DELETE', `/api/v1/workspaces/${workspaceId}/suites/${suiteId}/test-cases/${data.data.id}`, undefined, adminCookie);
    expect(del.status).toBe(200);
  });
});
