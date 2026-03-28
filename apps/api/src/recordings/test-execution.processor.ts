import { Injectable } from '@nestjs/common';
import { processExecutionJob } from '@selora/executor';
import type { TestExecutionJobData } from '@selora/queue';
import { PrismaService } from '../database/prisma.service';
import { BrowserMatrixService } from './browser-matrix.service';

@Injectable()
export class TestExecutionProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly browserMatrixService: BrowserMatrixService,
  ) {}

  async process(job: TestExecutionJobData) {
    // If this job has a browser result ID, mark it as RUNNING
    if (job.browserResultId) {
      await this.browserMatrixService.updateBrowserResult(job.browserResultId, {
        status: 'RUNNING',
      });
    }

    const result = await processExecutionJob({
      prisma: this.prisma,
      job,
      browserOptions: job.browserType
        ? {
            browserType: job.browserType,
            viewportWidth: job.viewportWidth,
            viewportHeight: job.viewportHeight,
          }
        : undefined,
    });

    // Update browser result record on completion
    if (job.browserResultId && result && typeof result === 'object') {
      const r = result as { status?: string; summary?: string; durationMs?: number };
      const finalStatus = r.status === 'TIMED_OUT' ? 'TIMED_OUT' : r.status === 'PASSED' ? 'PASSED' : 'FAILED';
      await this.browserMatrixService.updateBrowserResult(job.browserResultId, {
        status: finalStatus as 'PASSED' | 'FAILED' | 'TIMED_OUT',
        failureSummary: r.summary,
        durationMs: r.durationMs,
      });
    }

    return result;
  }
}