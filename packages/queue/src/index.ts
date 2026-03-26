import type { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
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
  /** When set, the ingestion updates this existing test instead of creating a new one. */
  canonicalTestId?: string;
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
  suiteId: string | null;
  environmentId: string;
  workspaceId: string;
  tenantId: string;
  actorUserId: string;
  requestId: string;
  requestedSourceMode: 'SUITE_DEFAULT' | 'PINNED_COMMIT' | 'BRANCH_HEAD';
  requestedGitRef: string | null;
  resolvedSourceMode: 'STORAGE_ARTIFACT' | 'PINNED_COMMIT' | 'BRANCH_HEAD';
  resolvedGitRef: string | null;
  resolvedCommitSha: string | null;
  sourceFallbackReason: string | null;
  publicationId: string | null;
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

// ─── Redis Pub/Sub for log streaming ─────────────────────────────────────────

export function getRedisUrl() {
  return process.env['REDIS_URL'] ?? 'redis://localhost:6379';
}

export function runLogChannel(runItemId: string) {
  return `selora:run-log:${runItemId}`;
}

export type RunLogEvent = {
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  ts: number;
};

let publisherClient: Redis | null = null;

function getPublisher(): Redis {
  if (!publisherClient) {
    publisherClient = new Redis(getRedisUrl());
  }
  return publisherClient;
}

export async function publishRunLog(runItemId: string, event: RunLogEvent) {
  try {
    const client = getPublisher();
    await client.publish(runLogChannel(runItemId), JSON.stringify(event));
  } catch {
    // Best-effort — don't fail the execution if pub/sub is down.
  }
}

export function createRedisSubscriber() {
  return new Redis(getRedisUrl());
}
