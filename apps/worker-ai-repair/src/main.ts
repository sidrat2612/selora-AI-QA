import { PrismaClient } from '@selora/database';
import { processRepairJob } from '@selora/ai-repair';
import {
  QUEUE_NAMES,
  Worker,
  SqsConsumer,
  getQueueMode,
  getRedisConnection,
  type AIRepairJobData,
  type Job,
} from '@selora/queue';

const prisma = new PrismaClient();

async function handleRepairJob(data: AIRepairJobData) {
  console.log(`Processing AI repair job`, data);
  await processRepairJob({ prisma, job: data });
}

async function bootstrap() {
  const mode = getQueueMode();

  if (mode === 'inline') {
    console.log('Worker-ai-repair not starting consumer because QUEUE_MODE=inline.');
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
    console.log('Worker-ai-repair started (SQS), waiting for jobs...');

    const shutdown = () => {
      console.log('Shutting down SQS consumer...');
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
    console.log(`Repair job ${job.id} completed`);
  });

  worker.on('failed', (job: Job<AIRepairJobData> | undefined, err: Error) => {
    console.error(`Repair job ${job?.id} failed:`, err.message);
  });

  console.log('Worker-ai-repair started (BullMQ), waiting for jobs...');
}

void bootstrap();
