import { Injectable } from '@nestjs/common';
import { processRepairJob } from '@selora/ai-repair';
import type { AIRepairJobData } from '@selora/queue';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { GitHubPublicationService } from '../github/github-publication.service';

@Injectable()
export class AIRepairProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly githubPublicationService: GitHubPublicationService,
  ) {}

  async process(job: AIRepairJobData) {
    const result = await processRepairJob({
      prisma: this.prisma,
      job,
    });

    if (result?.status === 'RERUN_PASSED') {
      await this.tryPublishSuite(job);
    }

    return result;
  }

  private async tryPublishSuite(job: AIRepairJobData) {
    try {
      const canonicalTest = await this.prisma.canonicalTest.findUnique({
        where: { id: job.canonicalTestId },
        select: { suiteId: true },
      });
      if (!canonicalTest?.suiteId) return;

      await this.githubPublicationService.publishSuite(
        canonicalTest.suiteId,
        { user: { id: job.actorUserId } } as RequestAuthContext,
        job.tenantId,
        job.requestId,
      );
    } catch {
      // Suite publish is best-effort — do not fail repair
    }
  }
}