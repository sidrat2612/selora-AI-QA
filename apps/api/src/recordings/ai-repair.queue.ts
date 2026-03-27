import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  QUEUE_NAMES,
  Queue,
  getQueueMode,
  getRedisConnection,
  sqsSendMessage,
  type AIRepairJobData,
} from '@selora/queue';
import { serviceUnavailable } from '../common/http-errors';
import { AIRepairProcessor } from './ai-repair.processor';

@Injectable()
export class AIRepairQueueService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<AIRepairJobData>;

  constructor(private readonly processor: AIRepairProcessor) {}

  async onModuleInit() {
    if (getQueueMode() !== 'bullmq') {
      return;
    }

    this.queue = new Queue<AIRepairJobData>(QUEUE_NAMES.AI_REPAIR, {
      connection: getRedisConnection(),
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async enqueue(job: AIRepairJobData) {
    const mode = getQueueMode();

    if (mode === 'inline') {
      queueMicrotask(() => {
        void this.processor.process(job).catch(() => undefined);
      });
      return;
    }

    if (mode === 'sqs') {
      await sqsSendMessage(QUEUE_NAMES.AI_REPAIR, job);
      return;
    }

    if (!this.queue) {
      throw serviceUnavailable('QUEUE_UNAVAILABLE', 'AI repair queue is not initialized.');
    }

    await this.queue.add('repair', job, {
      jobId: `generated-test-repair-${job.generatedTestArtifactId}`,
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1_000,
      },
    });
  }
}