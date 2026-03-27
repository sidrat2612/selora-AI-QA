import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  QUEUE_NAMES,
  Queue,
  getQueueMode,
  getRedisConnection,
  sqsSendMessage,
  type TestExecutionJobData,
} from '@selora/queue';
import { serviceUnavailable } from '../common/http-errors';
import { TestExecutionProcessor } from './test-execution.processor';

@Injectable()
export class TestExecutionQueueService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<TestExecutionJobData>;

  constructor(private readonly processor: TestExecutionProcessor) {}

  async onModuleInit() {
    if (getQueueMode() !== 'bullmq') {
      return;
    }

    this.queue = new Queue<TestExecutionJobData>(QUEUE_NAMES.TEST_EXECUTION, {
      connection: getRedisConnection(),
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async enqueue(job: TestExecutionJobData) {
    const mode = getQueueMode();

    if (mode === 'inline') {
      return this.processor.process(job);
    }

    if (mode === 'sqs') {
      await sqsSendMessage(QUEUE_NAMES.TEST_EXECUTION, job);
      return null;
    }

    if (!this.queue) {
      throw serviceUnavailable('QUEUE_UNAVAILABLE', 'Test execution queue is not initialized.');
    }

    await this.queue.add('execute', job, {
      jobId: `test-run-${job.testRunId}-${job.testRunItemId}`,
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 1,
    });

    return null;
  }

  async remove(testRunId: string, testRunItemId: string) {
    // SQS doesn't support job removal by ID
    if (getQueueMode() !== 'bullmq' || !this.queue) {
      return false;
    }

    const job = await this.queue.getJob(`test-run-${testRunId}-${testRunItemId}`);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state === 'active' || state === 'completed' || state === 'failed') {
      return false;
    }

    await job.remove();
    return true;
  }
}