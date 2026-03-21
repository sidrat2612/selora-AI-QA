import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  QUEUE_NAMES,
  Queue,
  getQueueMode,
  getRedisConnection,
  type TestValidationJobData,
} from '@selora/queue';
import { serviceUnavailable } from '../common/http-errors';
import { TestValidationProcessor } from './test-validation.processor';

@Injectable()
export class TestValidationQueueService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<TestValidationJobData>;

  constructor(private readonly processor: TestValidationProcessor) {}

  async onModuleInit() {
    if (getQueueMode() !== 'bullmq') {
      return;
    }

    this.queue = new Queue<TestValidationJobData>(QUEUE_NAMES.TEST_VALIDATION, {
      connection: getRedisConnection(),
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async enqueue(job: TestValidationJobData) {
    if (getQueueMode() === 'inline') {
      return this.processor.process(job);
    }

    if (!this.queue) {
      throw serviceUnavailable('QUEUE_UNAVAILABLE', 'Test validation queue is not initialized.');
    }

    await this.queue.add('validate', job, {
      jobId: `generated-test-${job.generatedTestArtifactId}`,
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1_000,
      },
    });

    return null;
  }
}