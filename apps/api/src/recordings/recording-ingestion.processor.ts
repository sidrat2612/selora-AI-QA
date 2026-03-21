import { Injectable } from '@nestjs/common';
import { Prisma, RecordingStatus } from '@prisma/client';
import type { RecordingIngestionJobData } from '@selora/queue';
import { analyzeRecordingToCanonical } from '@selora/recording-ingest';
import { getStorageConfig, readStoredText } from '@selora/storage';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { ensureDefaultSuite } from '../suites/suite-defaults';

@Injectable()
export class RecordingIngestionProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

      const canonicalTest = await this.prisma.$transaction(async (transaction) => {
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

      await this.auditService.record({
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        actorUserId: job.actorUserId,
        eventType: 'canonical_test.ingested',
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