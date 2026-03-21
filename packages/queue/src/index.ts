import type { ConnectionOptions } from 'bullmq';
export { Queue, Worker } from 'bullmq';
export type { Job } from 'bullmq';

export const QUEUE_NAMES = {
  RECORDING_INGESTION: 'recording-ingestion',
  TEST_VALIDATION: 'test-validation',
  TEST_EXECUTION: 'test-execution',
  AI_REPAIR: 'ai-repair',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type RecordingIngestionJobData = {
  recordingId: string;
  workspaceId: string;
  tenantId: string;
  actorUserId: string;
  requestId: string;
};

export type TestValidationJobData = {
  generatedTestArtifactId: string;
  canonicalTestId: string;
  workspaceId: string;
  tenantId: string;
  actorUserId: string;
  requestId: string;
};

export type AIRepairJobData = {
  generatedTestArtifactId: string;
  canonicalTestId: string;
  workspaceId: string;
  tenantId: string;
  actorUserId: string;
  requestId: string;
};

export type TestExecutionJobData = {
  testRunId: string;
  testRunItemId: string;
  generatedTestArtifactId: string;
  canonicalTestId: string;
  environmentId: string;
  workspaceId: string;
  tenantId: string;
  actorUserId: string;
  requestId: string;
};

export function getQueueMode() {
  if (process.env['QUEUE_MODE'] === 'inline') {
    return 'inline';
  }

  if (!process.env['REDIS_URL']) {
    return 'inline';
  }

  return 'bullmq';
}

export function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || '6379'),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}
