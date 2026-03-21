import { PrismaClient } from '@prisma/client';

process.env['DATABASE_URL'] ??= 'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';
process.env['NEXT_PUBLIC_API_URL'] ??= 'http://localhost:4000';

type JsonResponse<T> = {
  data: T;
};

type SessionPayload = {
  memberships: Array<{
    workspaceId: string | null;
  }>;
  activeWorkspace: {
    id: string | null;
  } | null;
};

type FeedbackPayload = {
  id: string;
  title: string;
};

const prisma = new PrismaClient();

function getApiBaseUrl() {
  return process.env['REGRESSION_API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
}

function getWebBaseUrl() {
  return process.env['REGRESSION_WEB_URL'] ?? 'http://localhost:3000';
}

function getCredentials() {
  return {
    email: process.env['REGRESSION_EMAIL'] ?? 'admin@selora.local',
    password: process.env['REGRESSION_PASSWORD'] ?? 'admin123',
  };
}

function parseSessionCookie(response: Response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const header = getSetCookie ? getSetCookie().join('; ') : response.headers.get('set-cookie') ?? '';
  const match = header.match(/selora_session=([^;]+)/);
  if (!match) {
    throw new Error('Login succeeded without issuing a selora_session cookie.');
  }

  return `selora_session=${match[1]}`;
}

async function expectJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as JsonResponse<T>;
  return payload.data;
}

async function expectHtml(path: string, cookie: string, expectedText: string) {
  const response = await fetch(`${getWebBaseUrl()}${path}`, {
    headers: { cookie },
    redirect: 'manual',
  });

  if (response.status !== 200) {
    const location = response.headers.get('location');
    throw new Error(`GET ${path} returned ${response.status}${location ? ` redirecting to ${location}` : ''}.`);
  }

  const html = await response.text();
  if (!html.includes(expectedText)) {
    throw new Error(`GET ${path} did not contain expected text: ${expectedText}`);
  }
}

async function main() {
  const apiBaseUrl = getApiBaseUrl();
  const { email, password } = getCredentials();

  console.log(`Running smoke checks against ${apiBaseUrl} and ${getWebBaseUrl()}...`);

  const ready = await expectJson<{ status: string; checks: Record<string, string> }>(
    await fetch(`${apiBaseUrl}/api/v1/health/ready`),
    'API readiness check',
  );

  if (ready.status !== 'ready') {
    throw new Error(`API readiness returned ${ready.status}.`);
  }

  const loginResponse = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const cookie = parseSessionCookie(loginResponse);
  const session = await expectJson<SessionPayload>(loginResponse, 'Login');

  const workspaceId = session.activeWorkspace?.id ?? session.memberships.find((item) => item.workspaceId)?.workspaceId;
  if (!workspaceId) {
    throw new Error('Login response did not include an active workspace.');
  }

  await expectJson<SessionPayload>(
    await fetch(`${apiBaseUrl}/api/v1/auth/session`, {
      headers: { cookie },
    }),
    'Session fetch',
  );

  await expectHtml(`/app/${workspaceId}/dashboard`, cookie, 'Repair analytics');
  await expectHtml(`/app/${workspaceId}/tests`, cookie, 'Recording ingestion');
  await expectHtml(`/app/${workspaceId}/runs`, cookie, 'Runs');
  await expectHtml(`/app/${workspaceId}/feedback`, cookie, 'Capture partner feedback in-app');

  const title = `Regression smoke ${new Date().toISOString()}`;
  let createdFeedbackId: string | null = null;

  try {
    const feedback = await expectJson<FeedbackPayload>(
      await fetch(`${apiBaseUrl}/api/v1/workspaces/${workspaceId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie,
        },
        body: JSON.stringify({
          title,
          summary: 'Automated regression smoke feedback submission.',
          category: 'UX',
        }),
      }),
      'Feedback creation',
    );

    createdFeedbackId = feedback.id;

    if (feedback.title !== title) {
      throw new Error('Smoke feedback response did not echo the submitted title.');
    }

    await expectHtml(`/app/${workspaceId}/feedback`, cookie, title);
  } finally {
    if (createdFeedbackId) {
      await prisma.auditEvent.deleteMany({
        where: {
          entityType: 'beta_feedback',
          entityId: createdFeedbackId,
        },
      });
      await prisma.betaFeedback.deleteMany({
        where: { id: createdFeedbackId },
      });
    }
  }

  console.log('Regression smoke checks passed.');
}

main()
  .catch((error) => {
    console.error('Regression smoke failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });