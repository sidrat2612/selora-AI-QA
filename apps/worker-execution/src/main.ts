import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { processExecutionJob } from '@selora/executor';
import {
  QUEUE_NAMES,
  Queue,
  Worker,
  SqsConsumer,
  getQueueMode,
  getRedisConnection,
  sqsSendMessage,
  createWorkerLogger,
  type AIRepairJobData,
  type Job,
  type TestExecutionJobData,
  type TestValidationJobData,
} from '@selora/queue';
import { Prisma } from '@prisma/client';
import { PrismaClient } from '@selora/database';
import {
  STORAGE_CATEGORIES,
  buildStorageKey,
  getStorageConfig,
  putStoredObject,
  readStoredBuffer,
  readStoredText,
} from '@selora/storage';
import { cleanupValidationWorkspace, runPlaywrightValidation } from '@selora/test-validator';
const prisma = new PrismaClient();

async function enqueueRepairJob(job: TestValidationJobData) {
  if (getQueueMode() === 'sqs') {
    await sqsSendMessage(QUEUE_NAMES.AI_REPAIR, job);
    return;
  }

  const queue = new Queue<AIRepairJobData>(QUEUE_NAMES.AI_REPAIR, {
    connection: getRedisConnection(),
  });

  try {
    await queue.add('repair', job, {
      jobId: `generated-test-repair-${job.generatedTestArtifactId}`,
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1_000,
      },
    });
  } finally {
    await queue.close();
  }
}

async function processValidationJob(job: TestValidationJobData) {
  const generatedArtifact = await prisma.generatedTestArtifact.findFirst({
    where: { id: job.generatedTestArtifactId, workspaceId: job.workspaceId },
    include: {
      canonicalTest: {
        select: { id: true, status: true, name: true },
      },
      workspace: {
        select: {
          environments: {
            where: { isDefault: true, status: 'ACTIVE' },
            select: { baseUrl: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!generatedArtifact) {
    return;
  }

  await prisma.$transaction([
    prisma.generatedTestArtifact.update({
      where: { id: generatedArtifact.id },
      data: {
        status: 'VALIDATING',
        validationStartedAt: new Date(),
      },
    }),
    prisma.canonicalTest.update({
      where: { id: generatedArtifact.canonicalTestId },
      data: { status: 'VALIDATING' },
    }),
  ]);

  const code = await readStoredText({
    config: getStorageConfig(),
    key: generatedArtifact.storageKey,
  });

  let validation;

  try {
    const environmentBaseUrl = generatedArtifact.workspace.environments[0]?.baseUrl;
    validation = await runPlaywrightValidation({
      code,
      baseUrl: environmentBaseUrl,
      timeoutMs: Number(process.env['VALIDATION_TIMEOUT_MS'] ?? '60000'),
      env: environmentBaseUrl
        ? {
            BASE_URL: environmentBaseUrl,
          }
        : undefined,
    });
  } catch (error) {
    await prisma.$transaction([
      prisma.generatedTestArtifact.update({
        where: { id: generatedArtifact.id },
        data: {
          status: 'FAILED',
          validatedAt: new Date(),
          metadataJson: {
            ...(asRecord(generatedArtifact.metadataJson) ?? {}),
            validation: {
              mode: 'playwright',
              ok: false,
              summary: serializeError(error).message,
              failureContext: serializeError(error),
              validatedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.canonicalTest.update({
        where: { id: generatedArtifact.canonicalTestId },
        data: { status: 'VALIDATING' },
      }),
    ]);
    await enqueueRepairJob(job);
    return;
  }

  try {
    const persistedArtifacts = [] as Array<{
      id: string;
      artifactType: string;
      fileName: string;
      contentType: string;
    }>;

    for (const candidate of validation.artifacts ?? []) {
      const buffer = await readFile(candidate.filePath);

      const storageKey = buildStorageKey({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        category: STORAGE_CATEGORIES.ARTIFACTS,
        fileName: `generated-tests/${generatedArtifact.id}/${candidate.fileName}`,
      });

      await putStoredObject({
        config: getStorageConfig(),
        key: storageKey,
        body: buffer,
        contentType: candidate.contentType,
      });

      const artifact = await prisma.artifact.create({
        data: {
          workspaceId: job.workspaceId,
          generatedTestArtifactId: generatedArtifact.id,
          artifactType: candidate.artifactType,
          fileName: candidate.fileName,
          storageKey,
          contentType: candidate.contentType,
          sizeBytes: BigInt(candidate.sizeBytes),
          checksum: createHash('sha256').update(buffer).digest('hex'),
        },
      });

      persistedArtifacts.push({
        id: artifact.id,
        artifactType: artifact.artifactType,
        fileName: artifact.fileName,
        contentType: artifact.contentType,
      });
    }

    await prisma.$transaction([
      prisma.generatedTestArtifact.update({
        where: { id: generatedArtifact.id },
        data: {
          status: validation.ok ? 'READY' : 'FAILED',
          validatedAt: new Date(),
          metadataJson: {
            ...(asRecord(generatedArtifact.metadataJson) ?? {}),
            validation: {
              mode: 'playwright',
              ok: validation.ok,
              summary: validation.summary,
              failureContext: validation.failureContext ?? null,
              artifacts: persistedArtifacts,
              validatedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.canonicalTest.update({
        where: { id: generatedArtifact.canonicalTestId },
        data: { status: validation.ok ? 'VALIDATED' : 'VALIDATING' },
      }),
      prisma.auditEvent.create({
        data: {
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
          actorUserId: job.actorUserId,
          eventType: validation.ok ? 'generated_test.validated' : 'generated_test.validation_failed',
          entityType: 'generated_test_artifact',
          entityId: generatedArtifact.id,
          requestId: job.requestId,
          metadataJson: {
            canonicalTestId: generatedArtifact.canonicalTestId,
            mode: 'playwright',
            summary: validation.summary,
            failureContext: validation.failureContext ?? null,
            artifacts: persistedArtifacts,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);

    if (!validation.ok) {
      await enqueueRepairJob(job);
    }
  } catch (error) {
    await prisma.$transaction([
      prisma.generatedTestArtifact.update({
        where: { id: generatedArtifact.id },
        data: {
          status: 'FAILED',
          validatedAt: new Date(),
          metadataJson: {
            ...(asRecord(generatedArtifact.metadataJson) ?? {}),
            validation: {
              mode: 'playwright',
              ok: false,
              summary: serializeError(error).message,
              failureContext: serializeError(error),
              validatedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.canonicalTest.update({
        where: { id: generatedArtifact.canonicalTestId },
        data: { status: 'VALIDATING' },
      }),
    ]);
    await enqueueRepairJob(job);
  } finally {
    await cleanupValidationWorkspace(validation.workingDirectory);
  }
}

function asRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: 'Unknown worker validation error.' };
}

async function bootstrap() {
  const logger = createWorkerLogger('worker-execution');
  const mode = getQueueMode();

  if (mode === 'inline') {
    logger.info('Not starting consumer because QUEUE_MODE=inline.');
    return;
  }

  if (mode === 'sqs') {
    const validationConsumer = new SqsConsumer<TestValidationJobData>({
      queueName: QUEUE_NAMES.TEST_VALIDATION,
      handler: processValidationJob,
      maxConcurrency: 2,
      visibilityTimeout: 300,
    });

    const executionConsumer = new SqsConsumer<TestExecutionJobData>({
      queueName: QUEUE_NAMES.TEST_EXECUTION,
      handler: async (data) => {
        await processExecutionJob({ prisma, job: data });
      },
      maxConcurrency: 2,
      visibilityTimeout: 300,
    });

    validationConsumer.start();
    executionConsumer.start();
    logger.info('Started (SQS), waiting for validation and execution jobs...');

    const shutdown = () => {
      logger.info('Shutting down SQS consumers...');
      validationConsumer.stop();
      executionConsumer.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return;
  }

  const connection = getRedisConnection();

  const validationWorker = new Worker<TestValidationJobData>(
    QUEUE_NAMES.TEST_VALIDATION,
    async (job: Job<TestValidationJobData>) => {
      await processValidationJob(job.data);
    },
    { connection },
  );

  const executionWorker = new Worker<TestExecutionJobData>(
    QUEUE_NAMES.TEST_EXECUTION,
    async (job: Job<TestExecutionJobData>) => {
      await processExecutionJob({
        prisma,
        job: job.data,
        workerJobId: job.id?.toString(),
      });
    },
    { connection },
  );

  validationWorker.on('completed', (job: Job<TestValidationJobData>) => {
    logger.info('Validation job completed', { jobId: job.id });
  });

  validationWorker.on('failed', (job: Job<TestValidationJobData> | undefined, err: Error) => {
    logger.error('Validation job failed', { jobId: job?.id, error: err.message });
  });

  executionWorker.on('completed', (job: Job<TestExecutionJobData>) => {
    logger.info('Execution job completed', { jobId: job.id });
  });

  executionWorker.on('failed', (job: Job<TestExecutionJobData> | undefined, err: Error) => {
    logger.error('Execution job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Started (BullMQ), waiting for validation and execution jobs...');
}

void bootstrap();
