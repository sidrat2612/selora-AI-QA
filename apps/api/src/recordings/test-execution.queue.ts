import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  QUEUE_NAMES,
  Queue,
  getQueueMode,
  getRedisConnection,
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
    if (getQueueMode() === 'inline') {
      return this.processor.process(job);
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
    if (!this.queue) {
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