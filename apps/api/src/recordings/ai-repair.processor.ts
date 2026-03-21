import { Injectable } from '@nestjs/common';
import { processRepairJob } from '@selora/ai-repair';
import type { AIRepairJobData } from '@selora/queue';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AIRepairProcessor {
  constructor(private readonly prisma: PrismaService) {}

  async process(job: AIRepairJobData) {
    return processRepairJob({
      prisma: this.prisma,
      job,
    });
  }
}