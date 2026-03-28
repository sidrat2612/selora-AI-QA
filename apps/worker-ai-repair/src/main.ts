import { PrismaClient } from '@selora/database';
import { processRepairJob } from '@selora/ai-repair';
import {
  QUEUE_NAMES,
  Worker,
  SqsConsumer,
  getQueueMode,
  getRedisConnection,
  createWorkerLogger,
  type AIRepairJobData,
  type Job,
} from '@selora/queue';

const prisma = new PrismaClient();
const logger = createWorkerLogger('worker-ai-repair');

async function handleRepairJob(data: AIRepairJobData) {
  logger.info('Processing AI repair job', { canonicalTestId: data.canonicalTestId });
  await processRepairJob({ prisma, job: data });
}

async function bootstrap() {
  const mode = getQueueMode();

  if (mode === 'inline') {
    logger.info('Not starting consumer because QUEUE_MODE=inline.');
    return;
  }

  if (mode === 'sqs') {
    const consumer = new SqsConsumer<AIRepairJobData>({
      queueName: QUEUE_NAMES.AI_REPAIR,
      handler: handleRepairJob,
      maxConcurrency: 2,
      visibilityTimeout: 300,
    });
    consumer.start();
    logger.info('Started (SQS), waiting for jobs...');

    const shutdown = () => {
      logger.info('Shutting down SQS consumer...');
      consumer.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return;
  }

  const worker = new Worker<AIRepairJobData>(
    QUEUE_NAMES.AI_REPAIR,
    async (job: Job<AIRepairJobData>) => {
      await handleRepairJob(job.data);
    },
    {
      connection: getRedisConnection(),
    },
  );

  worker.on('completed', (job: Job<AIRepairJobData>) => {
    logger.info('Repair job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<AIRepairJobData> | undefined, err: Error) => {
    logger.error('Repair job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Started (BullMQ), waiting for jobs...');
}

void bootstrap();
