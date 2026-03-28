import type { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs';
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
  /** Browser configuration for multi-browser matrix execution */
  browserType?: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT';
  /** Device profile affecting viewport */
  deviceProfile?: 'DESKTOP' | 'TABLET' | 'MOBILE';
  /** Viewport width override */
  viewportWidth?: number;
  /** Viewport height override */
  viewportHeight?: number;
  /** Browser result record ID to update on completion */
  browserResultId?: string;
};

export type QueueMode = 'inline' | 'bullmq' | 'sqs';

export function getQueueMode(): QueueMode {
  const mode = process.env['QUEUE_MODE'];
  if (mode === 'inline') return 'inline';
  if (mode === 'sqs') return 'sqs';

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

// ─── SQS Support ─────────────────────────────────────────────────────────────

const SQS_QUEUE_URL_ENV: Record<QueueName, string> = {
  'recording-ingestion': 'SQS_QUEUE_URL_RECORDING_INGESTION',
  'test-validation': 'SQS_QUEUE_URL_TEST_VALIDATION',
  'test-execution': 'SQS_QUEUE_URL_TEST_EXECUTION',
  'ai-repair': 'SQS_QUEUE_URL_AI_REPAIR',
};

export function getSqsQueueUrl(queueName: QueueName): string {
  const envVar = SQS_QUEUE_URL_ENV[queueName];
  const url = process.env[envVar];
  if (!url) {
    throw new Error(`SQS queue URL not configured: env ${envVar} is empty`);
  }
  return url;
}

let sqsClient: SQSClient | null = null;

export function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: process.env['AWS_REGION'] ?? process.env['S3_REGION'] ?? 'us-east-1',
    });
  }
  return sqsClient;
}

export async function sqsSendMessage<T>(queueName: QueueName, data: T, deduplicationId?: string): Promise<void> {
  const client = getSqsClient();
  const queueUrl = getSqsQueueUrl(queueName);
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(data),
      ...(deduplicationId ? { MessageDeduplicationId: deduplicationId, MessageGroupId: queueName } : {}),
    }),
  );
}

export interface SqsConsumerOptions<T> {
  queueName: QueueName;
  handler: (data: T) => Promise<void>;
  maxConcurrency?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
}

export class SqsConsumer<T> {
  private running = false;
  private activeCount = 0;
  private readonly client: SQSClient;
  private readonly queueUrl: string;
  private readonly maxConcurrency: number;
  private readonly waitTimeSeconds: number;
  private readonly visibilityTimeout: number;
  private readonly handler: (data: T) => Promise<void>;

  constructor(options: SqsConsumerOptions<T>) {
    this.client = getSqsClient();
    this.queueUrl = getSqsQueueUrl(options.queueName);
    this.handler = options.handler;
    this.maxConcurrency = options.maxConcurrency ?? 1;
    this.waitTimeSeconds = options.waitTimeSeconds ?? 20;
    this.visibilityTimeout = options.visibilityTimeout ?? 300;
  }

  start(): void {
    this.running = true;
    void this.pollLoop();
  }

  stop(): void {
    this.running = false;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const maxMessages = Math.max(1, Math.min(10, this.maxConcurrency - this.activeCount));
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: maxMessages,
            WaitTimeSeconds: this.waitTimeSeconds,
            VisibilityTimeout: this.visibilityTimeout,
          }),
        );

        const messages = response.Messages ?? [];
        const tasks = messages.map((msg) => this.processMessage(msg));
        await Promise.allSettled(tasks);
      } catch (error) {
        console.error('[SQS] Poll error:', error instanceof Error ? error.message : error);
        // Back off on errors
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }

  private async processMessage(message: Message): Promise<void> {
    this.activeCount++;
    try {
      const data = JSON.parse(message.Body ?? '{}') as T;
      await this.handler(data);
      // Delete on success
      await this.client.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
    } catch (error) {
      // Let SQS retry via visibility timeout
      console.error('[SQS] Message processing failed:', error instanceof Error ? error.message : error);
    } finally {
      this.activeCount--;
    }
  }
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

/* ── Structured Worker Logger ─────────────────────────────────────────────── */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export function createWorkerLogger(workerName: string) {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      worker: workerName,
      message,
      ...meta,
    });
    if (level === 'error') {
      process.stderr.write(entry + '\n');
    } else {
      process.stdout.write(entry + '\n');
    }
  };

  return {
    info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
    debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  };
}
