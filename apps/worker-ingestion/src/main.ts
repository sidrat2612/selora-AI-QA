import { Prisma } from '@prisma/client';
import { PrismaClient } from '@selora/database';
import {
  QUEUE_NAMES,
  Worker,
  SqsConsumer,
  getQueueMode,
  getRedisConnection,
  createWorkerLogger,
  type Job,
  type RecordingIngestionJobData,
} from '@selora/queue';
import { analyzeRecordingToCanonical } from '@selora/recording-ingest';
import { getStorageConfig, readStoredText } from '@selora/storage';

const prisma = new PrismaClient();

async function processRecordingIngestion(job: RecordingIngestionJobData) {
  const recording = await prisma.recordingAsset.findFirst({
    where: { id: job.recordingId, workspaceId: job.workspaceId },
    select: {
      id: true,
      filename: true,
      checksum: true,
      storageKey: true,
      metadataJson: true,
    },
  });

  if (!recording) {
    return;
  }

  await prisma.recordingAsset.update({
    where: { id: recording.id },
    data: { status: 'PROCESSING' },
  });

  try {
    const content = await readStoredText({
      config: getStorageConfig(),
      key: recording.storageKey,
    });

    const analysis = await analyzeRecordingToCanonical({
      filename: recording.filename,
      content,
      checksum: recording.checksum,
    });

    const canonicalTest = await prisma.$transaction(async (transaction) => {
      const test = await transaction.canonicalTest.create({
        data: {
          workspaceId: job.workspaceId,
          recordingAssetId: recording.id,
          name: analysis.definition.name,
          description: analysis.definition.description ?? null,
          tagsJson: analysis.definition.tags as Prisma.InputJsonValue,
          definitionJson: analysis.definition as Prisma.InputJsonValue,
          status: 'INGESTED',
        },
      });

      await transaction.recordingAsset.update({
        where: { id: recording.id },
        data: {
          status: 'NORMALIZED',
          metadataJson: {
            ...(asRecord(recording.metadataJson) ?? {}),
            analysis: analysis.metadata,
          } as Prisma.InputJsonValue,
        },
      });

      return test;
    });

    await prisma.auditEvent.create({
      data: {
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        actorUserId: job.actorUserId,
        eventType: 'canonical_test.ingested',
        entityType: 'canonical_test',
        entityId: canonicalTest.id,
        requestId: job.requestId,
        metadataJson: {
          recordingAssetId: recording.id,
          inferenceMode: analysis.metadata.inferenceMode,
          promptVersion: analysis.metadata.promptVersion,
          model: analysis.metadata.model ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    await prisma.recordingAsset.update({
      where: { id: recording.id },
      data: {
        status: 'FAILED',
        metadataJson: {
          ...(asRecord(recording.metadataJson) ?? {}),
          processingError: serializeError(error),
        } as Prisma.InputJsonValue,
      },
    });
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

  return { message: 'Unknown processing error.' };
}

async function bootstrap() {
  const logger = createWorkerLogger('worker-ingestion');
  const mode = getQueueMode();

  if (mode === 'inline') {
    logger.info('Not starting consumer because QUEUE_MODE=inline.');
    return;
  }

  if (mode === 'sqs') {
    const consumer = new SqsConsumer<RecordingIngestionJobData>({
      queueName: QUEUE_NAMES.RECORDING_INGESTION,
      handler: processRecordingIngestion,
      maxConcurrency: 2,
      visibilityTimeout: 120,
    });
    consumer.start();
    logger.info('Started (SQS), waiting for recording ingestion jobs...');

    const shutdown = () => {
      logger.info('Shutting down SQS consumer...');
      consumer.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return;
  }

  const connection = getRedisConnection();

  const worker = new Worker<RecordingIngestionJobData>(
    QUEUE_NAMES.RECORDING_INGESTION,
    async (job: Job<RecordingIngestionJobData>) => {
      await processRecordingIngestion(job.data);
    },
    { connection },
  );

  worker.on('completed', (job: Job<RecordingIngestionJobData>) => {
    logger.info('Recording ingestion job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<RecordingIngestionJobData> | undefined, err: Error) => {
    logger.error('Recording ingestion job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Started (BullMQ), waiting for recording ingestion jobs...');
}

void bootstrap();