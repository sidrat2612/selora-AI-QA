import { z } from 'zod';
import type { ApiError } from './types';

export const membershipInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['TENANT_ADMIN', 'WORKSPACE_OPERATOR', 'WORKSPACE_VIEWER']),
});

export const environmentSchema = z.object({
  name: z.string().min(2),
  baseUrl: z.string().url(),
  secretRef: z.string().min(2),
  secretValue: z.string().min(2).optional().or(z.literal('')),
  testTimeoutMs: z.coerce.number().int().positive(),
  runTimeoutMs: z.coerce.number().int().positive(),
  maxRetries: z.coerce.number().int().min(0),
  isDefault: z.boolean(),
});

export const retentionSchema = z.object({
  logsDays: z.number().int().positive(),
  screenshotsDays: z.number().int().positive(),
  videosDays: z.number().int().positive(),
  tracesDays: z.number().int().positive(),
  auditDays: z.number().int().positive(),
});

export const suiteSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
});

export const githubIntegrationSchema = z.object({
  credentialMode: z.enum(['PAT', 'GITHUB_APP']),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  defaultBranch: z.string().min(1),
  workflowPath: z.string().optional().or(z.literal('')),
  allowedWriteScope: z.enum(['READ_ONLY', 'BRANCH_PUSH', 'PULL_REQUESTS']),
  pullRequestRequired: z.boolean(),
  secretRef: z.string().optional().or(z.literal('')),
  secretValue: z.string().optional().or(z.literal('')),
  webhookSecretRef: z.string().optional().or(z.literal('')),
  webhookSecretValue: z.string().optional().or(z.literal('')),
  appId: z.string().optional().or(z.literal('')),
  appSlug: z.string().optional().or(z.literal('')),
  installationId: z.string().optional().or(z.literal('')),
});

export const testrailIntegrationSchema = z.object({
  baseUrl: z.string().url(),
  projectId: z.string().min(1),
  suiteIdExternal: z.string().optional().or(z.literal('')),
  sectionId: z.string().optional().or(z.literal('')),
  username: z.string().min(1),
  secretRef: z.string().optional().or(z.literal('')),
  apiKey: z.string().optional().or(z.literal('')),
  syncPolicy: z.enum(['MANUAL']),
});

export const testrailCaseLinkSchema = z.object({
  externalCaseId: z.string().optional().or(z.literal('')),
  ownerEmail: z.string().email().optional().or(z.literal('')),
});

export function getApiBaseUrl() {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
}

export function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}/api/v1${path}`;
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({
      error: { code: 'UNKNOWN_ERROR', message: 'Request failed.' },
    }))) as ApiError;
    throw new Error(payload.error.message || 'Request failed.');
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}