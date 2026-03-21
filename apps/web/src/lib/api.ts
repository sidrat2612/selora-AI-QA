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