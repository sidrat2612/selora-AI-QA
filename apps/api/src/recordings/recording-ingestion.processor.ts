import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, RecordingStatus } from '@prisma/client';
import type { RecordingIngestionJobData } from '@selora/queue';
import { analyzeRecordingToCanonical, type RecordingAnalysisResult } from '@selora/recording-ingest';
import {
  STORAGE_CATEGORIES,
  buildStorageKey,
  getStorageConfig,
  putStoredObject,
  readStoredText,
} from '@selora/storage';
import { generatePlaywrightTest } from '@selora/test-generator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { ensureDefaultSuite } from '../suites/suite-defaults';
import { TestValidationQueueService } from './test-validation.queue';

@Injectable()
export class RecordingIngestionProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly testValidationQueue: TestValidationQueueService,
  ) {}

  async process(job: RecordingIngestionJobData) {
    const recording = await this.prisma.recordingAsset.findFirst({
      where: { id: job.recordingId, workspaceId: job.workspaceId },
      select: {
        id: true,
        filename: true,
        checksum: true,
        storageKey: true,
        status: true,
        metadataJson: true,
      },
    });

    if (!recording) {
      return;
    }

    await this.prisma.recordingAsset.update({
      where: { id: recording.id },
      data: { status: RecordingStatus.PROCESSING },
    });

    try {
      const content = await readStoredText({
        config: getStorageConfig(),
        key: recording.storageKey,
      });

      const analysis = await analyzeRecordingToCanonical({
        filename: recording.filename,
        content,
        checksum: recording.checksum,
      });

      const canonicalTest = job.canonicalTestId
        ? await this.reRecordExistingTest(job as typeof job & { canonicalTestId: string }, recording, analysis)
        : await this.createNewCanonicalTest(job, recording, analysis);

      await this.auditService.record({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        actorUserId: job.actorUserId,
        eventType: job.canonicalTestId ? 'canonical_test.re_recorded' : 'canonical_test.ingested',
        entityType: 'canonical_test',
        entityId: canonicalTest.id,
        requestId: job.requestId,
        metadataJson: {
          recordingAssetId: recording.id,
          inferenceMode: analysis.metadata.inferenceMode,
          promptVersion: analysis.metadata.promptVersion,
          model: analysis.metadata.model ?? null,
        },
      });

      // Auto-generate Playwright test if the suite has a GitHub integration
      if (canonicalTest.suiteId) {
        await this.tryAutoGenerate(canonicalTest as typeof canonicalTest & { suiteId: string }, analysis.definition, job);
      }
    } catch (error) {
      await this.prisma.recordingAsset.update({
        where: { id: recording.id },
        data: {
          status: RecordingStatus.FAILED,
          metadataJson: {
            ...(this.asRecord(recording.metadataJson) ?? {}),
            processingError: this.serializeError(error),
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async createNewCanonicalTest(
    job: RecordingIngestionJobData,
    recording: { id: string; metadataJson: unknown },
    analysis: RecordingAnalysisResult,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const defaultSuite = await ensureDefaultSuite(transaction, {
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
      });

      const test = await transaction.canonicalTest.create({
        data: {
          workspaceId: job.workspaceId,
          suiteId: defaultSuite.id,
          recordingAssetId: recording.id,
          name: analysis.definition.name,
          description: analysis.definition.description ?? null,
          tagsJson: analysis.definition.tags as Prisma.InputJsonValue,
          definitionJson: analysis.definition as Prisma.InputJsonValue,
          status: 'INGESTED',
        },
      });

      await transaction.recordingAsset.update({
        where: { id: recording.id },
        data: {
          status: RecordingStatus.NORMALIZED,
          metadataJson: {
            ...(this.asRecord(recording.metadataJson) ?? {}),
            analysis: analysis.metadata,
          } as Prisma.InputJsonValue,
        },
      });

      return test;
    });
  }

  private async reRecordExistingTest(
    job: RecordingIngestionJobData & { canonicalTestId: string },
    recording: { id: string; metadataJson: unknown },
    analysis: RecordingAnalysisResult,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const test = await transaction.canonicalTest.update({
        where: { id: job.canonicalTestId },
        data: {
          recordingAssetId: recording.id,
          definitionJson: analysis.definition as Prisma.InputJsonValue,
          tagsJson: analysis.definition.tags as Prisma.InputJsonValue,
          canonicalVersion: { increment: 1 },
          status: 'INGESTED',
        },
      });

      await transaction.recordingAsset.update({
        where: { id: recording.id },
        data: {
          status: RecordingStatus.NORMALIZED,
          metadataJson: {
            ...(this.asRecord(recording.metadataJson) ?? {}),
            analysis: analysis.metadata,
          } as Prisma.InputJsonValue,
        },
      });

      return test;
    });
  }

  private async tryAutoGenerate(
    canonicalTest: { id: string; suiteId: string; workspaceId: string },
    definition: unknown,
    job: RecordingIngestionJobData,
  ) {
    try {
      const integration = await this.prisma.gitHubSuiteIntegration.findUnique({
        where: { suiteId: canonicalTest.suiteId },
        select: { status: true },
      });

      if (integration?.status !== 'CONNECTED') {
        return;
      }

      const environment = await this.prisma.environment.findFirst({
        where: { workspaceId: job.workspaceId, isDefault: true, status: 'ACTIVE' },
        select: { baseUrl: true },
      });

      const generated = await generatePlaywrightTest({
        canonicalDefinition: definition,
        baseUrl: environment?.baseUrl,
      });

      const latestArtifact = await this.prisma.generatedTestArtifact.findFirst({
        where: { canonicalTestId: canonicalTest.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const nextVersion = (latestArtifact?.version ?? 0) + 1;
      const sanitizedFileName = generated.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
      const storageKey = buildStorageKey({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        category: STORAGE_CATEGORIES.GENERATED_TESTS,
        fileName: `v${nextVersion}-${sanitizedFileName}`,
      });
      const checksum = createHash('sha256').update(generated.code).digest('hex');

      await putStoredObject({
        config: getStorageConfig(),
        key: storageKey,
        body: Buffer.from(generated.code, 'utf8'),
        contentType: 'text/typescript',
        metadata: {
          workspaceid: job.workspaceId,
          tenantid: job.tenantId,
          testid: canonicalTest.id,
          version: String(nextVersion),
        },
      });

      const artifact = await this.prisma.$transaction(async (tx) => {
        const created = await tx.generatedTestArtifact.create({
          data: {
            workspaceId: job.workspaceId,
            canonicalTestId: canonicalTest.id,
            version: nextVersion,
            fileName: generated.fileName,
            storageKey,
            checksum,
            generatorVersion: generated.generatorVersion,
            status: 'CREATED',
            createdByUserId: job.actorUserId,
            metadataJson: {
              generation: {
                inferenceMode: generated.metadata.inferenceMode,
                promptVersion: generated.metadata.promptVersion,
                model: generated.metadata.model ?? null,
                redactionCount: generated.metadata.redactionCount,
              },
            } as Prisma.InputJsonValue,
          },
        });

        await tx.canonicalTest.update({
          where: { id: canonicalTest.id },
          data: { status: 'GENERATED' },
        });

        return created;
      });

      await this.testValidationQueue.enqueue({
        generatedTestArtifactId: artifact.id,
        canonicalTestId: canonicalTest.id,
        workspaceId: job.workspaceId,
        tenantId: job.tenantId,
        actorUserId: job.actorUserId,
        requestId: job.requestId,
      });
    } catch (err) {
      console.warn(
        '[recording-ingestion] Auto-generate failed (best-effort):',
        (err as Error).message ?? err,
      );
    }
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

    return { message: 'Unknown processing error.' };
  }
}