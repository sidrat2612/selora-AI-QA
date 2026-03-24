import { Injectable } from '@nestjs/common';
import { Prisma, type GeneratedTestStatus, type TestStatus } from '@prisma/client';
import type { TestValidationJobData } from '@selora/queue';
import { getStorageConfig, readStoredText } from '@selora/storage';
import { validateGeneratedPlaywrightTest } from '@selora/test-validator';
import { AuditService } from '../audit/audit.service';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { GitHubPublicationService } from '../github/github-publication.service';
import { AIRepairQueueService } from './ai-repair.queue';

@Injectable()
export class TestValidationProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly aiRepairQueue: AIRepairQueueService,
    private readonly githubPublicationService: GitHubPublicationService,
  ) {}

  async process(job: TestValidationJobData) {
    const generatedArtifact = await this.prisma.generatedTestArtifact.findFirst({
      where: { id: job.generatedTestArtifactId, workspaceId: job.workspaceId },
      include: {
        canonicalTest: {
          select: { id: true, status: true },
        },
      },
    });

    if (!generatedArtifact) {
      return null;
    }

    await this.markValidationStarted(generatedArtifact.id, generatedArtifact.canonicalTestId);

    try {
      const code = await readStoredText({
        config: getStorageConfig(),
        key: generatedArtifact.storageKey,
      });

      const validation = validateGeneratedPlaywrightTest({ code });
      const artifactStatus: GeneratedTestStatus = validation.ok ? 'READY' : 'FAILED';
      const canonicalStatus: TestStatus = validation.ok ? 'VALIDATED' : 'VALIDATING';

      await this.prisma.$transaction([
        this.prisma.generatedTestArtifact.update({
          where: { id: generatedArtifact.id },
          data: {
            status: artifactStatus,
            validatedAt: new Date(),
            metadataJson: {
              ...(this.asRecord(generatedArtifact.metadataJson) ?? {}),
              validation: {
                mode: 'inline-preflight',
                ok: validation.ok,
                summary: validation.summary,
                issues: validation.issues,
                validatedAt: new Date().toISOString(),
              },
            } as Prisma.InputJsonValue,
          },
        }),
        this.prisma.canonicalTest.update({
          where: { id: generatedArtifact.canonicalTestId },
          data: { status: canonicalStatus },
        }),
      ]);

      await this.auditService.record({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        actorUserId: job.actorUserId,
        eventType: validation.ok ? 'generated_test.validated' : 'generated_test.validation_failed',
        entityType: 'generated_test_artifact',
        entityId: generatedArtifact.id,
        requestId: job.requestId,
        metadataJson: {
          canonicalTestId: generatedArtifact.canonicalTestId,
          mode: 'inline-preflight',
          summary: validation.summary,
          issues: validation.issues,
        },
      });

      if (validation.ok) {
        // Auto-publish suite to GitHub when artifact passes validation
        await this.tryPublishSuite(generatedArtifact.canonicalTestId, job);
      } else {
        await this.aiRepairQueue.enqueue({
          generatedTestArtifactId: generatedArtifact.id,
          canonicalTestId: generatedArtifact.canonicalTestId,
          workspaceId: job.workspaceId,
          tenantId: job.tenantId,
          actorUserId: job.actorUserId,
          requestId: job.requestId,
        });
      }

      return {
        artifactStatus,
        canonicalStatus,
        summary: validation.summary,
        issues: validation.issues,
      };
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.generatedTestArtifact.update({
          where: { id: generatedArtifact.id },
          data: {
            status: 'FAILED',
            validatedAt: new Date(),
            metadataJson: {
              ...(this.asRecord(generatedArtifact.metadataJson) ?? {}),
              validation: {
                mode: 'inline-preflight',
                ok: false,
                summary: this.serializeError(error).message,
                failureContext: this.serializeError(error),
                validatedAt: new Date().toISOString(),
              },
            } as Prisma.InputJsonValue,
          },
        }),
        this.prisma.canonicalTest.update({
          where: { id: generatedArtifact.canonicalTestId },
          data: { status: 'VALIDATING' },
        }),
      ]);

      await this.auditService.record({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        actorUserId: job.actorUserId,
        eventType: 'generated_test.validation_failed',
        entityType: 'generated_test_artifact',
        entityId: generatedArtifact.id,
        requestId: job.requestId,
        metadataJson: {
          canonicalTestId: generatedArtifact.canonicalTestId,
          mode: 'inline-preflight',
          failureContext: this.serializeError(error),
        },
      });

      await this.aiRepairQueue.enqueue({
        generatedTestArtifactId: generatedArtifact.id,
        canonicalTestId: generatedArtifact.canonicalTestId,
        workspaceId: job.workspaceId,
        tenantId: job.tenantId,
        actorUserId: job.actorUserId,
        requestId: job.requestId,
      });

      return {
        artifactStatus: 'FAILED' as const,
        canonicalStatus: 'VALIDATING' as const,
        summary: this.serializeError(error).message,
        issues: [],
      };
    }
  }

  private async markValidationStarted(artifactId: string, canonicalTestId: string) {
    await this.prisma.$transaction([
      this.prisma.generatedTestArtifact.update({
        where: { id: artifactId },
        data: {
          status: 'VALIDATING',
          validationStartedAt: new Date(),
        },
      }),
      this.prisma.canonicalTest.update({
        where: { id: canonicalTestId },
        data: { status: 'VALIDATING' },
      }),
    ]);
  }

  private asRecord(value: unknown) {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return { message: 'Unknown validation error.' };
  }

  private async tryPublishSuite(
    canonicalTestId: string,
    job: TestValidationJobData,
  ) {
    try {
      const canonicalTest = await this.prisma.canonicalTest.findUnique({
        where: { id: canonicalTestId },
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
      // Suite publish is best-effort — do not fail validation
    }
  }
}