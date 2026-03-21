import { PrismaClient } from '@selora/database';
import { processRepairJob } from '@selora/ai-repair';
import {
  QUEUE_NAMES,
  Worker,
  getQueueMode,
  getRedisConnection,
  type AIRepairJobData,
  type Job,
} from '@selora/queue';

const prisma = new PrismaClient();

async function bootstrap() {
  if (getQueueMode() === 'inline') {
    console.log('Worker-ai-repair not starting BullMQ consumer because QUEUE_MODE=inline.');
    return;
  }

  const worker = new Worker<AIRepairJobData>(
    QUEUE_NAMES.AI_REPAIR,
    async (job: Job<AIRepairJobData>) => {
      console.log(`Processing AI repair job ${job.id}`, job.data);
      await processRepairJob({
        prisma,
        job: job.data,
      });
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

  console.log('Worker-ai-repair started, waiting for jobs...');
}

void bootstrap();
