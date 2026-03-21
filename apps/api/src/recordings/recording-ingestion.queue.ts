import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  QUEUE_NAMES,
  getQueueMode,
  getRedisConnection,
  Queue,
  type RecordingIngestionJobData,
} from '@selora/queue';
import { serviceUnavailable } from '../common/http-errors';
import { RecordingIngestionProcessor } from './recording-ingestion.processor';

@Injectable()
export class RecordingIngestionQueueService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<RecordingIngestionJobData>;

  constructor(private readonly processor: RecordingIngestionProcessor) {}

  async onModuleInit() {
    if (getQueueMode() !== 'bullmq') {
      return;
    }

    const connection = getRedisConnection();
    this.queue = new Queue<RecordingIngestionJobData>(QUEUE_NAMES.RECORDING_INGESTION, { connection });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async enqueue(job: RecordingIngestionJobData) {
    if (getQueueMode() === 'inline') {
      queueMicrotask(() => {
        void this.processor.process(job).catch(() => undefined);
      });
      return;
    }

    if (!this.queue) {
      throw serviceUnavailable('QUEUE_UNAVAILABLE', 'Recording ingestion queue is not initialized.');
    }

    await this.queue.add('ingest', job, {
      jobId: `recording-${job.recordingId}`,
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