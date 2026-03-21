import { Injectable } from '@nestjs/common';
import { processExecutionJob } from '@selora/executor';
import type { TestExecutionJobData } from '@selora/queue';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TestExecutionProcessor {
  constructor(private readonly prisma: PrismaService) {}

  async process(job: TestExecutionJobData) {
    return processExecutionJob({
      prisma: this.prisma,
      job,
    });
  }
}