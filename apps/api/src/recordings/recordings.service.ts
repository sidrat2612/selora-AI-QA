import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  ExecutionSourceRequestMode,
  Prisma,
  RecordingStatus,
  type GeneratedTestStatus,
  type RepairMode,
  type RepairStatus,
  type RunStatus,
  type TestStatus,
} from '@prisma/client';
import { validateCanonicalTestDefinition } from '@selora/canonical-tests';
import type { TestExecutionJobData } from '@selora/queue';
import { RecordingValidationError, validateRecordingUpload } from '@selora/recording-ingest';
import {
  STORAGE_CATEGORIES,
  buildStorageKey,
  getStorageConfig,
  readStoredBuffer,
  readStoredText,
  putStoredObject,
} from '@selora/storage';
import { generatePlaywrightTest } from '@selora/test-generator';
import { AuditService } from '../audit/audit.service';
import { badRequest, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { QuotaService } from '../usage/quota.service';
import { ExecutionSourceResolverService } from './execution-source-resolver.service';
import { RecordingIngestionQueueService } from './recording-ingestion.queue';
import { TestExecutionQueueService } from './test-execution.queue';
import { TestValidationQueueService } from './test-validation.queue';

type UploadedSourceFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type ArtifactDownloadDisposition = 'inline' | 'attachment';

type ArtifactDownloadTokenPayload = {
  version: 1;
  kind: 'run-artifact' | 'validation-artifact';
  workspaceId: string;
  tenantId: string;
  actorUserId: string;
  artifactId: string;
  runId?: string;
  itemId?: string;
  testId?: string;
  generatedArtifactId?: string;
  disposition: ArtifactDownloadDisposition;
  expiresAt: number;
};

type ArtifactDownloadRecord = {
  id: string;
  fileName: string;
  contentType: string;
  storageKey: string;
};

@Injectable()
export class RecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotaService: QuotaService,
    private readonly auditService: AuditService,
    private readonly executionSourceResolver: ExecutionSourceResolverService,
    private readonly recordingIngestionQueue: RecordingIngestionQueueService,
    private readonly testExecutionQueue: TestExecutionQueueService,
    private readonly testValidationQueue: TestValidationQueueService,
  ) {}

  async listRecordings(workspaceId: string, query: Record<string, string | undefined>) {
    const page = this.readPositiveInt(query['page'], 1);
    const pageSize = this.readPageSize(query['pageSize']);
    const search = this.readOptionalString(query['search']);
    const status = this.readRecordingStatus(query['status']);

    const where: Prisma.RecordingAssetWhereInput = {
      workspaceId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { filename: { contains: search, mode: 'insensitive' } },
              { canonicalTests: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.recordingAsset.findMany({
        where,
        include: {
          canonicalTests: {
            select: { id: true, name: true, status: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
          },
          uploadedBy: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recordingAsset.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalCount,
      hasMore: page * pageSize < totalCount,
    };
  }

  async getRecording(workspaceId: string, recordingId: string) {
    const recording = await this.prisma.recordingAsset.findFirst({
      where: { id: recordingId, workspaceId },
      include: {
        canonicalTests: {
          include: {
            generatedArtifacts: {
              select: { id: true, version: true, status: true, createdAt: true },
              orderBy: { version: 'desc' },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
        uploadedBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!recording) {
      throw notFound('RECORDING_NOT_FOUND', 'Recording was not found.');
    }

    return recording;
  }

  async uploadRecording(
    workspaceId: string,
    file: UploadedSourceFile | undefined,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    if (!file) {
      throw badRequest('RECORDING_FILE_REQUIRED', 'Provide a recording file in the file field.');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      throw notFound('WORKSPACE_NOT_FOUND', 'Workspace was not found.');
    }

    try {
      const validated = validateRecordingUpload({
        filename: file.originalname,
        size: file.size,
        content: file.buffer.toString('utf8'),
      });

      await this.quotaService.assertRecordingUploadAllowed(tenantId, validated.size);

      const version = await this.getNextRecordingVersion(workspaceId, validated.filename);
      const storageKey = buildStorageKey({
        tenantId,
        workspaceId,
        category: STORAGE_CATEGORIES.RECORDINGS,
        fileName: `v${version}-${this.sanitizeStorageFileName(validated.filename)}`,
      });

      const storageConfig = getStorageConfig();
      await putStoredObject({
        config: storageConfig,
        key: storageKey,
        body: Buffer.from(validated.content, 'utf8'),
        contentType: file.mimetype || 'text/plain',
        metadata: {
          checksum: validated.checksum,
          workspaceid: workspaceId,
          tenantid: tenantId,
        },
      });

      const created = await this.prisma.recordingAsset.create({
        data: {
          workspaceId,
          sourceType: 'PLAYWRIGHT_CODEGEN_TS',
          filename: validated.filename,
          originalPath: file.originalname,
          storageKey,
          checksum: validated.checksum,
          version,
          status: RecordingStatus.UPLOADED,
          uploadedByUserId: auth.user.id,
          metadataJson: {
            fileSizeBytes: validated.size,
            mimeType: file.mimetype || 'text/plain',
            uploadedFrom: 'api',
          } as Prisma.InputJsonValue,
        },
      });

      await this.auditService.record({
        tenantId,
        workspaceId,
        actorUserId: auth.user.id,
        eventType: 'recording.uploaded',
        entityType: 'recording_asset',
        entityId: created.id,
        requestId,
        metadataJson: {
          filename: validated.filename,
          version,
          checksum: validated.checksum,
        },
      });

      await this.recordingIngestionQueue.enqueue({
        recordingId: created.id,
        workspaceId,
        tenantId,
        actorUserId: auth.user.id,
        requestId,
      });

      return {
        recordingId: created.id,
        status: RecordingStatus.UPLOADED,
        queued: true,
      };
    } catch (error) {
      if (error instanceof RecordingValidationError) {
        throw badRequest(error.code, error.message);
      }

      throw error;
    }
  }

  async listTests(workspaceId: string, query: Record<string, string | undefined>) {
    const page = this.readPositiveInt(query['page'], 1);
    const pageSize = this.readPageSize(query['pageSize']);
    const search = this.readOptionalString(query['search']);
    const status = this.readTestStatus(query['status']);
    const tag = this.readOptionalString(query['tag']);

    const where: Prisma.CanonicalTestWhereInput = {
      workspaceId,
      ...(status ? { status } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(tag ? { tagsJson: { array_contains: [tag] } } : {}),
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.canonicalTest.findMany({
        where,
        include: {
          suite: {
            select: { id: true, slug: true, name: true, isDefault: true },
          },
          recordingAsset: {
            select: { id: true, filename: true, version: true, status: true, createdAt: true },
          },
          generatedArtifacts: {
            select: { id: true, version: true, status: true, createdAt: true },
            orderBy: { version: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.canonicalTest.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalCount,
      hasMore: page * pageSize < totalCount,
    };
  }

  async getTest(workspaceId: string, testId: string) {
    const test = await this.prisma.canonicalTest.findFirst({
      where: { id: testId, workspaceId },
      include: {
        suite: {
          select: { id: true, slug: true, name: true, isDefault: true },
        },
        recordingAsset: {
          select: {
            id: true,
            filename: true,
            version: true,
            status: true,
            metadataJson: true,
            createdAt: true,
          },
        },
        generatedArtifacts: {
          select: {
            id: true,
            version: true,
            fileName: true,
            status: true,
            storageKey: true,
            checksum: true,
            generatorVersion: true,
            metadataJson: true,
            validationStartedAt: true,
            validatedAt: true,
            createdAt: true,
            publication: {
              select: {
                id: true,
                generatedTestArtifactId: true,
                status: true,
                targetPath: true,
                branchName: true,
                defaultBranch: true,
                pullRequestNumber: true,
                pullRequestUrl: true,
                pullRequestState: true,
                headCommitSha: true,
                mergeCommitSha: true,
                lastError: true,
                lastAttemptedAt: true,
                publishedAt: true,
                mergedAt: true,
                lastWebhookEventAt: true,
                createdAt: true,
                updatedAt: true,
                webhookDeliveries: {
                  select: {
                    id: true,
                    deliveryId: true,
                    eventName: true,
                    action: true,
                    status: true,
                    processingAttempts: true,
                    lastError: true,
                    receivedAt: true,
                    processedAt: true,
                    replayedAt: true,
                  },
                  orderBy: { receivedAt: 'desc' },
                  take: 5,
                },
              },
            },
            artifacts: {
              select: {
                id: true,
                artifactType: true,
                fileName: true,
                contentType: true,
                sizeBytes: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!test) {
      throw notFound('CANONICAL_TEST_NOT_FOUND', 'Canonical test was not found.');
    }

    return {
      ...test,
      generatedArtifacts: test.generatedArtifacts.map((artifact) => ({
        ...artifact,
        artifacts: artifact.artifacts.map((validationArtifact) => ({
          ...validationArtifact,
          sizeBytes: Number(validationArtifact.sizeBytes),
        })),
        publication: artifact.publication
          ? {
              ...artifact.publication,
              recentDeliveries: artifact.publication.webhookDeliveries,
              deliveryStats: {
                total: artifact.publication.webhookDeliveries.length,
                failed: artifact.publication.webhookDeliveries.filter((delivery) => delivery.status === 'FAILED').length,
                processed: artifact.publication.webhookDeliveries.filter((delivery) => delivery.status === 'PROCESSED').length,
              },
            }
          : null,
      })),
    };
  }

  async getGeneratedArtifact(workspaceId: string, testId: string, artifactId: string) {
    const artifact = await this.prisma.generatedTestArtifact.findFirst({
      where: {
        id: artifactId,
        workspaceId,
        canonicalTestId: testId,
      },
      include: {
        artifacts: {
          select: {
            id: true,
            artifactType: true,
            fileName: true,
            contentType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        publication: {
          select: {
            id: true,
            generatedTestArtifactId: true,
            status: true,
            targetPath: true,
            branchName: true,
            defaultBranch: true,
            pullRequestNumber: true,
            pullRequestUrl: true,
            pullRequestState: true,
            headCommitSha: true,
            mergeCommitSha: true,
            lastError: true,
            lastAttemptedAt: true,
            publishedAt: true,
            mergedAt: true,
            lastWebhookEventAt: true,
            createdAt: true,
            updatedAt: true,
            webhookDeliveries: {
              select: {
                id: true,
                deliveryId: true,
                eventName: true,
                action: true,
                status: true,
                processingAttempts: true,
                lastError: true,
                receivedAt: true,
                processedAt: true,
                replayedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 10,
            },
          },
        },
      },
    });

    if (!artifact) {
      throw notFound('GENERATED_TEST_ARTIFACT_NOT_FOUND', 'Generated test artifact was not found.');
    }

    const code = await readStoredText({
      config: getStorageConfig(),
      key: artifact.storageKey,
    });

    return {
      ...artifact,
      artifacts: artifact.artifacts.map((validationArtifact) => ({
        ...validationArtifact,
        sizeBytes: Number(validationArtifact.sizeBytes),
      })),
      publication: artifact.publication
        ? {
            ...artifact.publication,
            recentDeliveries: artifact.publication.webhookDeliveries,
            deliveryStats: {
              total: artifact.publication.webhookDeliveries.length,
              failed: artifact.publication.webhookDeliveries.filter((delivery) => delivery.status === 'FAILED').length,
              processed: artifact.publication.webhookDeliveries.filter((delivery) => delivery.status === 'PROCESSED').length,
            },
          }
        : null,
      code,
    };
  }

  async getGeneratedArtifactValidationAsset(
    workspaceId: string,
    testId: string,
    artifactId: string,
    validationArtifactId: string,
  ) {
    const artifact = await this.findValidationArtifactRecord(
      workspaceId,
      testId,
      artifactId,
      validationArtifactId,
    );

    return {
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      buffer: await readStoredBuffer({
        config: getStorageConfig(),
        key: artifact.storageKey,
      }),
    };
  }

  async issueValidationArtifactDownloadUrl(
    workspaceId: string,
    testId: string,
    artifactId: string,
    validationArtifactId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const artifact = await this.findValidationArtifactRecord(
      workspaceId,
      testId,
      artifactId,
      validationArtifactId,
    );
    const disposition = this.resolveDownloadDisposition(artifact.contentType);
    const token = this.createArtifactDownloadToken({
      version: 1,
      kind: 'validation-artifact',
      workspaceId,
      tenantId,
      actorUserId: auth.user.id,
      artifactId: artifact.id,
      testId,
      generatedArtifactId: artifactId,
      disposition,
      expiresAt: Date.now() + this.getArtifactDownloadTtlMs(),
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'artifact.download_url_issued',
      entityType: 'artifact',
      entityId: artifact.id,
      requestId,
      metadataJson: {
        artifactKind: 'validation-artifact',
        expiresAt: new Date(Date.now() + this.getArtifactDownloadTtlMs()).toISOString(),
        contentType: artifact.contentType,
      },
    });

    return {
      url: this.buildSignedArtifactDownloadPath(workspaceId, token),
      expiresAt: new Date(Date.now() + this.getArtifactDownloadTtlMs()).toISOString(),
    };
  }

  async getRepairAttempts(workspaceId: string, testId: string) {
    const attempts = await this.prisma.aIRepairAttempt.findMany({
      where: {
        workspaceId,
        canonicalTestId: testId,
      },
      include: {
        generatedTestArtifact: {
          select: {
            id: true,
            version: true,
            fileName: true,
          },
        },
        workspace: {
          select: { id: true },
        },
      },
      orderBy: [
        { attemptNumber: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return Promise.all(
      attempts.map(async (attempt) => {
        const patchText = attempt.patchStorageKey
          ? await readStoredText({
              config: getStorageConfig(),
              key: attempt.patchStorageKey,
            }).catch(() => null)
          : null;

        const patchArtifact = await this.prisma.artifact.findFirst({
          where: {
            workspaceId,
            generatedTestArtifactId: attempt.generatedTestArtifactId,
            artifactType: 'REPAIR_DIFF',
            storageKey: attempt.patchStorageKey ?? undefined,
          },
          select: {
            id: true,
            fileName: true,
            contentType: true,
            sizeBytes: true,
            createdAt: true,
          },
        });

        return {
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          repairMode: attempt.repairMode,
          status: attempt.status,
          promptVersion: attempt.promptVersion,
          modelName: attempt.modelName,
          diffSummary: attempt.diffSummary,
          patchStorageKey: attempt.patchStorageKey,
          patchText,
          sanitizationMetadataJson: attempt.sanitizationMetadataJson,
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt,
          createdAt: attempt.createdAt,
          generatedTestArtifact: attempt.generatedTestArtifact,
          patchArtifact: patchArtifact
            ? {
                ...patchArtifact,
                sizeBytes: Number(patchArtifact.sizeBytes),
              }
            : null,
        };
      }),
    );
  }

  async getRepairAnalytics(workspaceId: string, query: Record<string, string | undefined>) {
    const page = this.readPositiveInt(query['page'], 1);
    const pageSize = Math.min(this.readPageSize(query['pageSize']), 50);
    const repairMode = this.readRepairMode(query['mode']);
    const repairStatus = this.readRepairStatus(query['status']);
    const now = new Date();
    const defaultSince = new Date(now);
    defaultSince.setUTCDate(defaultSince.getUTCDate() - 29);
    defaultSince.setUTCHours(0, 0, 0, 0);

    const since = this.readDate(query['since'], 'REPAIR_ANALYTICS_DATE_INVALID') ?? defaultSince;
    const until = this.readDate(query['until'], 'REPAIR_ANALYTICS_DATE_INVALID') ?? now;

    if (since.valueOf() > until.valueOf()) {
      throw badRequest(
        'REPAIR_ANALYTICS_RANGE_INVALID',
        'since must be earlier than or equal to until.',
      );
    }

    const where: Prisma.AIRepairAttemptWhereInput = {
      workspaceId,
      ...(repairMode ? { repairMode } : {}),
      ...(repairStatus ? { status: repairStatus } : {}),
      createdAt: {
        gte: since,
        lte: until,
      },
    };

    const [
      totalAttempts,
      successfulAttempts,
      countsByMode,
      successfulByMode,
      countsByStatus,
      trendRows,
      attempts,
    ] = await this.prisma.$transaction([
      this.prisma.aIRepairAttempt.count({ where }),
      this.prisma.aIRepairAttempt.count({
        where: {
          ...where,
          status: 'RERUN_PASSED',
        },
      }),
      this.prisma.aIRepairAttempt.groupBy({
        by: ['repairMode'],
        where,
        orderBy: { repairMode: 'asc' },
        _count: true,
      }),
      this.prisma.aIRepairAttempt.groupBy({
        by: ['repairMode'],
        where: {
          ...where,
          status: 'RERUN_PASSED',
        },
        orderBy: { repairMode: 'asc' },
        _count: true,
      }),
      this.prisma.aIRepairAttempt.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.aIRepairAttempt.findMany({
        where,
        select: {
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.aIRepairAttempt.findMany({
        where,
        include: {
          canonicalTest: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          generatedTestArtifact: {
            select: {
              id: true,
              version: true,
              fileName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { attemptNumber: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const successByMode = new Map(
      successfulByMode.map((row) => [row.repairMode, Number(row._count)]),
    );
    const byMode = countsByMode.map((row) => {
      const total = Number(row._count);
      const modeSuccesses = successByMode.get(row.repairMode) ?? 0;
      return {
        repairMode: row.repairMode,
        totalAttempts: total,
        successfulAttempts: modeSuccesses,
        successRate: calculatePercentage(modeSuccesses, total),
      };
    });

    const byStatus = countsByStatus.map((row) => ({
      status: row.status,
      totalAttempts: Number(row._count),
    }));

    const trendInterval = getRepairTrendInterval(since, until);
    const trends = buildRepairTrendSeries(since, until, trendInterval, trendRows);

    return {
      workspaceId,
      periodStart: since.toISOString(),
      periodEnd: until.toISOString(),
      appliedFilters: {
        mode: repairMode ?? null,
        status: repairStatus ?? null,
        page,
        pageSize,
      },
      totals: {
        totalAttempts,
        successfulAttempts,
        successRate: calculatePercentage(successfulAttempts, totalAttempts),
        modesUsed: byMode.filter((row) => row.totalAttempts > 0).length,
      },
      byMode,
      byStatus,
      trends,
      attempts: {
        items: attempts,
        page,
        pageSize,
        totalCount: totalAttempts,
        hasMore: page * pageSize < totalAttempts,
      },
    };
  }

  async createRun(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const { environmentId, testIds, requestedSourceMode, requestedGitRef } =
      this.readRunCreationBody(body);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        concurrentExecutionLimit: true,
        maxTestsPerRun: true,
        runCooldownSeconds: true,
      },
    });

    if (workspace) {
      if (testIds.length > workspace.maxTestsPerRun) {
        throw badRequest(
          'RUN_TEST_COUNT_LIMIT_REACHED',
          `Workspace allows at most ${workspace.maxTestsPerRun} tests per run. Split this request into smaller runs.`,
        );
      }

      if (workspace.runCooldownSeconds > 0) {
        const mostRecentRun = await this.prisma.testRun.findFirst({
          where: { workspaceId },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });

        if (mostRecentRun) {
          const cooldownExpiresAt = new Date(
            mostRecentRun.createdAt.getTime() + workspace.runCooldownSeconds * 1000,
          );

          if (cooldownExpiresAt > new Date()) {
            throw badRequest(
              'RUN_COOLDOWN_ACTIVE',
              `Workspace run creation is throttled for ${workspace.runCooldownSeconds} seconds after each run. Wait for the cooldown to expire before starting another run.`,
              {
                lastRunId: mostRecentRun.id,
                cooldownExpiresAt: cooldownExpiresAt.toISOString(),
              },
            );
          }
        }
      }

      const activeRunCount = await this.prisma.testRun.count({
        where: {
          workspaceId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });

      if (activeRunCount >= workspace.concurrentExecutionLimit) {
        throw badRequest(
          'CONCURRENT_LIMIT_REACHED',
          `Workspace has reached its concurrent execution limit of ${workspace.concurrentExecutionLimit}. Cancel or wait for active runs to finish.`,
        );
      }
    }

    await this.quotaService.assertRunCreationAllowed(tenantId);

    const environment = await this.prisma.environment.findFirst({
      where: {
        id: environmentId,
        workspaceId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        secretRef: true,
      },
    });

    if (!environment) {
      throw badRequest('RUN_ENVIRONMENT_INVALID', 'The selected environment is invalid or inactive.');
    }

    const tests = await this.prisma.canonicalTest.findMany({
      where: {
        workspaceId,
        id: { in: testIds },
      },
      include: {
        suite: {
          select: {
            id: true,
            name: true,
            executionSourcePolicy: true,
            allowBranchHeadExecution: true,
            allowStorageExecutionFallback: true,
          },
        },
        generatedArtifacts: {
          where: { status: 'READY' },
          select: {
            id: true,
            version: true,
            fileName: true,
            createdAt: true,
            publication: {
              select: {
                id: true,
                targetPath: true,
                branchName: true,
                defaultBranch: true,
                headCommitSha: true,
                mergeCommitSha: true,
              },
            },
          },
          orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });

    const testsById = new Map(tests.map((test) => [test.id, test]));
    const missingIds = testIds.filter((id) => !testsById.has(id));
    const ineligibleTests = tests.filter(
      (test) => test.status !== 'VALIDATED' && test.status !== 'AUTO_REPAIRED',
    );
    const testsMissingArtifacts = tests.filter((test) => !test.generatedArtifacts[0]);

    if (missingIds.length > 0 || ineligibleTests.length > 0 || testsMissingArtifacts.length > 0) {
      throw badRequest('RUN_TEST_SELECTION_INVALID', 'Selected tests must exist and be execution-ready.', {
        missingIds,
        invalidStatus: ineligibleTests.map((test) => ({ id: test.id, status: test.status })),
        missingReadyArtifactIds: testsMissingArtifacts.map((test) => test.id),
      });
    }

    const orderedTests = testIds.map((id) => testsById.get(id)!);
    const resolvedSources = await this.executionSourceResolver.resolveSources({
      requestedSourceMode,
      requestedGitRef,
      tests: orderedTests,
    });
    const resolvedSourcesByTestId = new Map(
      resolvedSources.map((source) => [source.canonicalTestId, source]),
    );

    const createdRun = await this.prisma.$transaction(async (transaction) => {
      const run = await transaction.testRun.create({
        data: {
          tenantId,
          workspaceId,
          environmentId: environment.id,
          triggeredByUserId: auth.user.id,
          runType: 'MANUAL',
          requestedSourceMode,
          requestedGitRef,
          status: 'QUEUED',
          totalCount: orderedTests.length,
          queuedCount: orderedTests.length,
          runningCount: 0,
          passedCount: 0,
          failedCount: 0,
          canceledCount: 0,
          timedOutCount: 0,
        },
      });

      await transaction.testRunItem.createMany({
        data: orderedTests.map((test, index) => {
          const resolvedSource = resolvedSourcesByTestId.get(test.id);

          return {
            testRunId: run.id,
            canonicalTestId: test.id,
            generatedTestArtifactId: test.generatedArtifacts[0]!.id,
            publicationId: resolvedSource?.publicationId ?? null,
            sequence: index + 1,
            requestedSourceMode: resolvedSource?.requestedSourceMode ?? requestedSourceMode,
            requestedGitRef: resolvedSource?.requestedGitRef ?? requestedGitRef,
            resolvedSourceMode: resolvedSource?.resolvedSourceMode ?? 'STORAGE_ARTIFACT',
            resolvedGitRef: resolvedSource?.resolvedGitRef ?? null,
            resolvedCommitSha: resolvedSource?.resolvedCommitSha ?? null,
            sourceFallbackReason: resolvedSource?.sourceFallbackReason ?? null,
            status: 'QUEUED',
          };
        }),
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          workspaceId,
          actorUserId: auth.user.id,
          eventType: 'test_run.created',
          entityType: 'test_run',
          entityId: run.id,
          requestId,
          metadataJson: {
            environmentId: environment.id,
            environmentName: environment.name,
            baseUrl: environment.baseUrl,
            requestedSourceMode,
            requestedGitRef,
            testIds,
            totalCount: orderedTests.length,
            storageFallbacks: resolvedSources.filter((source) => source.sourceFallbackReason).map((source) => ({
              canonicalTestId: source.canonicalTestId,
              reason: source.sourceFallbackReason,
            })),
          } as Prisma.InputJsonValue,
        },
      });

      return run;
    });

    const runItems = await this.prisma.testRunItem.findMany({
      where: { testRunId: createdRun.id },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        canonicalTestId: true,
        generatedTestArtifactId: true,
      },
    });

    for (const item of runItems) {
      const resolvedSource = resolvedSourcesByTestId.get(item.canonicalTestId);
      await this.testExecutionQueue.enqueue({
        testRunId: createdRun.id,
        testRunItemId: item.id,
        generatedTestArtifactId: item.generatedTestArtifactId,
        canonicalTestId: item.canonicalTestId,
        suiteId: orderedTests.find((test) => test.id === item.canonicalTestId)?.suiteId ?? null,
        environmentId: environment.id,
        workspaceId,
        tenantId,
        actorUserId: auth.user.id,
        requestId,
        requestedSourceMode: resolvedSource?.requestedSourceMode ?? requestedSourceMode,
        requestedGitRef: resolvedSource?.requestedGitRef ?? requestedGitRef,
        resolvedSourceMode: resolvedSource?.resolvedSourceMode ?? 'STORAGE_ARTIFACT',
        resolvedGitRef: resolvedSource?.resolvedGitRef ?? null,
        resolvedCommitSha: resolvedSource?.resolvedCommitSha ?? null,
        sourceFallbackReason: resolvedSource?.sourceFallbackReason ?? null,
        publicationId: resolvedSource?.publicationId ?? null,
      } satisfies TestExecutionJobData);
    }

    return this.getRun(workspaceId, createdRun.id);
  }

  async listRuns(workspaceId: string, query: Record<string, string | undefined>) {
    const page = this.readPositiveInt(query['page'], 1);
    const pageSize = this.readPageSize(query['pageSize']);
    const status = this.readRunStatus(query['status']);
    const startDate = this.readDate(query['startDate'], 'RUN_DATE_INVALID');
    const endDate = this.readDate(query['endDate'], 'RUN_DATE_INVALID');
    const search = this.readOptionalString(query['search']);
    const triggeredBy = this.readOptionalString(query['triggeredBy']);
    const sortBy = this.readRunSortBy(query['sortBy']);

    const where: Prisma.TestRunWhereInput = {
      workspaceId,
      ...(status ? { status } : {}),
      ...((startDate || endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            items: {
              some: {
                canonicalTest: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
          }
        : {}),
      ...(triggeredBy
        ? {
            OR: [
              { triggeredByUserId: triggeredBy },
              { triggeredBy: { is: { email: { contains: triggeredBy, mode: 'insensitive' } } } },
              { triggeredBy: { is: { name: { contains: triggeredBy, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.testRun.findMany({
        where,
        include: {
          environment: {
            select: { id: true, name: true, baseUrl: true, isDefault: true },
          },
          triggeredBy: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy:
          sortBy === 'status'
            ? [{ status: 'asc' }, { createdAt: 'desc' }]
            : sortBy === 'duration'
              ? [{ finishedAt: 'desc' }, { startedAt: 'asc' }, { createdAt: 'desc' }]
              : { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.testRun.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapRun(item)),
      page,
      pageSize,
      totalCount,
      hasMore: page * pageSize < totalCount,
    };
  }

  async getRun(workspaceId: string, runId: string) {
    const run = await this.prisma.testRun.findFirst({
      where: {
        id: runId,
        workspaceId,
      },
      include: {
        environment: {
          select: { id: true, name: true, baseUrl: true, isDefault: true },
        },
        triggeredBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!run) {
      throw notFound('TEST_RUN_NOT_FOUND', 'Test run was not found.');
    }

    return this.mapRun(run);
  }

  async listRunItems(workspaceId: string, runId: string) {
    const run = await this.prisma.testRun.findFirst({
      where: {
        id: runId,
        workspaceId,
      },
      select: { id: true },
    });

    if (!run) {
      throw notFound('TEST_RUN_NOT_FOUND', 'Test run was not found.');
    }

    const items = await this.prisma.testRunItem.findMany({
      where: {
        testRunId: runId,
      },
      include: {
        canonicalTest: {
          select: { id: true, name: true, status: true },
        },
        generatedTestArtifact: {
          select: { id: true, version: true, fileName: true, status: true },
        },
        publication: {
          select: {
            id: true,
            status: true,
            targetPath: true,
            branchName: true,
            defaultBranch: true,
            mergeCommitSha: true,
            pullRequestNumber: true,
            pullRequestUrl: true,
          },
        },
        artifacts: {
          select: {
            id: true,
            artifactType: true,
            fileName: true,
            contentType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });

    return items.map((item) => ({
      ...item,
      artifacts: item.artifacts.map((artifact) => ({
        ...artifact,
        sizeBytes: Number(artifact.sizeBytes),
      })),
    }));
  }

  async getRunArtifact(workspaceId: string, runId: string, itemId: string, artifactId: string) {
    const artifact = await this.findRunArtifactRecord(workspaceId, runId, itemId, artifactId);

    return {
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      buffer: await readStoredBuffer({
        config: getStorageConfig(),
        key: artifact.storageKey,
      }),
    };
  }

  async issueRunArtifactDownloadUrl(
    workspaceId: string,
    runId: string,
    itemId: string,
    artifactId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const artifact = await this.findRunArtifactRecord(workspaceId, runId, itemId, artifactId);
    const disposition = this.resolveDownloadDisposition(artifact.contentType);
    const token = this.createArtifactDownloadToken({
      version: 1,
      kind: 'run-artifact',
      workspaceId,
      tenantId,
      actorUserId: auth.user.id,
      artifactId,
      runId,
      itemId,
      disposition,
      expiresAt: Date.now() + this.getArtifactDownloadTtlMs(),
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'artifact.download_url_issued',
      entityType: 'artifact',
      entityId: artifact.id,
      requestId,
      metadataJson: {
        artifactKind: 'run-artifact',
        expiresAt: new Date(Date.now() + this.getArtifactDownloadTtlMs()).toISOString(),
        contentType: artifact.contentType,
      },
    });

    return {
      url: this.buildSignedArtifactDownloadPath(workspaceId, token),
      expiresAt: new Date(Date.now() + this.getArtifactDownloadTtlMs()).toISOString(),
    };
  }

  async resolveSignedArtifactDownload(workspaceId: string, token: string, requestId: string) {
    const payload = this.readArtifactDownloadToken(token);
    if (payload.workspaceId !== workspaceId) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    if (payload.expiresAt <= Date.now()) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_EXPIRED', 'Signed artifact download URL has expired.');
    }

    const artifact = payload.kind === 'run-artifact'
      ? await this.findRunArtifactRecord(
          workspaceId,
          payload.runId as string,
          payload.itemId as string,
          payload.artifactId,
        )
      : await this.findValidationArtifactRecord(
          workspaceId,
          payload.testId as string,
          payload.generatedArtifactId as string,
          payload.artifactId,
        );

    await this.auditService.record({
      tenantId: payload.tenantId,
      workspaceId,
      actorUserId: payload.actorUserId,
      eventType: 'artifact.downloaded',
      entityType: 'artifact',
      entityId: artifact.id,
      requestId,
      metadataJson: {
        artifactKind: payload.kind,
        disposition: payload.disposition,
        contentType: artifact.contentType,
      },
    });

    return {
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      disposition: payload.disposition,
      buffer: await readStoredBuffer({
        config: getStorageConfig(),
        key: artifact.storageKey,
      }),
    };
  }

  async cancelRun(
    workspaceId: string,
    runId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const run = await this.prisma.testRun.findFirst({
      where: {
        id: runId,
        workspaceId,
      },
      include: {
        items: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!run) {
      throw notFound('TEST_RUN_NOT_FOUND', 'Test run was not found.');
    }

    if (run.status === 'PASSED' || run.status === 'FAILED' || run.status === 'TIMED_OUT' || run.status === 'CANCELED') {
      return this.getRun(workspaceId, runId);
    }

    for (const item of run.items) {
      if (item.status === 'QUEUED') {
        await this.testExecutionQueue.remove(run.id, item.id);
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.testRunItem.updateMany({
        where: {
          testRunId: run.id,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        data: {
          status: 'CANCELED',
          finishedAt: now,
          failureSummary: 'Run canceled by operator.',
        },
      });

      const [queuedCount, runningCount, passedCount, failedCount, canceledCount, timedOutCount] = await Promise.all([
        transaction.testRunItem.count({ where: { testRunId: run.id, status: 'QUEUED' } }),
        transaction.testRunItem.count({ where: { testRunId: run.id, status: 'RUNNING' } }),
        transaction.testRunItem.count({ where: { testRunId: run.id, status: 'PASSED' } }),
        transaction.testRunItem.count({ where: { testRunId: run.id, status: 'FAILED' } }),
        transaction.testRunItem.count({ where: { testRunId: run.id, status: 'CANCELED' } }),
        transaction.testRunItem.count({ where: { testRunId: run.id, status: 'TIMED_OUT' } }),
      ]);

      await transaction.testRun.update({
        where: { id: run.id },
        data: {
          status: 'CANCELED',
          totalCount: queuedCount + runningCount + passedCount + failedCount + canceledCount + timedOutCount,
          queuedCount,
          runningCount,
          passedCount,
          failedCount,
          canceledCount,
          timedOutCount,
          finishedAt: now,
        },
      });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          workspaceId,
          actorUserId: auth.user.id,
          eventType: 'test_run.canceled',
          entityType: 'test_run',
          entityId: run.id,
          requestId,
          metadataJson: {
            canceledItemCount: canceledCount,
            totalCount: run.totalCount,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return this.getRun(workspaceId, runId);
  }

  async compareRuns(workspaceId: string, runIdA: string, runIdB: string) {
    const [runA, runB] = await Promise.all([
      this.prisma.testRun.findFirst({
        where: { id: runIdA, workspaceId },
        include: {
          environment: { select: { id: true, name: true, baseUrl: true } },
          triggeredBy: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.testRun.findFirst({
        where: { id: runIdB, workspaceId },
        include: {
          environment: { select: { id: true, name: true, baseUrl: true } },
          triggeredBy: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);

    if (!runA || !runB) {
      throw notFound('TEST_RUN_NOT_FOUND', 'One or both runs were not found.');
    }

    const [itemsA, itemsB] = await Promise.all([
      this.prisma.testRunItem.findMany({
        where: { testRunId: runIdA },
        include: {
          canonicalTest: { select: { id: true, name: true } },
        },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.testRunItem.findMany({
        where: { testRunId: runIdB },
        include: {
          canonicalTest: { select: { id: true, name: true } },
        },
        orderBy: { sequence: 'asc' },
      }),
    ]);

    const mapItemsByTestId = (items: typeof itemsA) =>
      new Map(items.map((item) => [item.canonicalTestId, item]));

    const mapA = mapItemsByTestId(itemsA);
    const mapB = mapItemsByTestId(itemsB);
    const allTestIds = [...new Set([...mapA.keys(), ...mapB.keys()])];

    const comparisons = allTestIds.map((testId) => {
      const a = mapA.get(testId);
      const b = mapB.get(testId);
      const testName = a?.canonicalTest.name ?? b?.canonicalTest.name ?? testId;

      return {
        canonicalTestId: testId,
        testName,
        runA: a ? { status: a.status, durationMs: a.startedAt && a.finishedAt ? new Date(a.finishedAt).valueOf() - new Date(a.startedAt).valueOf() : null } : null,
        runB: b ? { status: b.status, durationMs: b.startedAt && b.finishedAt ? new Date(b.finishedAt).valueOf() - new Date(b.startedAt).valueOf() : null } : null,
        changed: a && b ? a.status !== b.status : true,
      };
    });

    const durationA = runA.startedAt && runA.finishedAt ? new Date(runA.finishedAt).valueOf() - new Date(runA.startedAt).valueOf() : null;
    const durationB = runB.startedAt && runB.finishedAt ? new Date(runB.finishedAt).valueOf() - new Date(runB.startedAt).valueOf() : null;

    return {
      runA: {
        id: runA.id,
        status: runA.status,
        totalCount: runA.totalCount,
        passedCount: runA.passedCount,
        failedCount: runA.failedCount,
        durationMs: durationA,
        environment: runA.environment,
        triggeredBy: runA.triggeredBy,
        createdAt: runA.createdAt,
      },
      runB: {
        id: runB.id,
        status: runB.status,
        totalCount: runB.totalCount,
        passedCount: runB.passedCount,
        failedCount: runB.failedCount,
        durationMs: durationB,
        environment: runB.environment,
        triggeredBy: runB.triggeredBy,
        createdAt: runB.createdAt,
      },
      comparisons,
      summary: {
        totalTests: allTestIds.length,
        changedCount: comparisons.filter((c) => c.changed).length,
        onlyInA: comparisons.filter((c) => c.runA && !c.runB).length,
        onlyInB: comparisons.filter((c) => !c.runA && c.runB).length,
      },
    };
  }

  async generateTest(
    workspaceId: string,
    testId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const canonicalTest = await this.prisma.canonicalTest.findFirst({
      where: {
        id: testId,
        workspaceId,
        status: { not: 'ARCHIVED' },
      },
      include: {
        recordingAsset: {
          select: {
            id: true,
            filename: true,
            checksum: true,
          },
        },
        generatedArtifacts: {
          select: { version: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
        workspace: {
          select: {
            environments: {
              where: { isDefault: true, status: 'ACTIVE' },
              select: { baseUrl: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!canonicalTest) {
      throw notFound('CANONICAL_TEST_NOT_FOUND', 'Canonical test was not found.');
    }

    const definition = validateCanonicalTestDefinition(canonicalTest.definitionJson);
    const defaultEnvironment = canonicalTest.workspace.environments[0];
    const generated = await generatePlaywrightTest({
      canonicalDefinition: definition,
      baseUrl: defaultEnvironment?.baseUrl,
    });
    const nextVersion = (canonicalTest.generatedArtifacts[0]?.version ?? 0) + 1;
    const storageKey = buildStorageKey({
      tenantId,
      workspaceId,
      category: STORAGE_CATEGORIES.GENERATED_TESTS,
      fileName: `v${nextVersion}-${this.sanitizeStorageFileName(generated.fileName)}`,
    });
    const checksum = createHash('sha256').update(generated.code).digest('hex');

    await putStoredObject({
      config: getStorageConfig(),
      key: storageKey,
      body: Buffer.from(generated.code, 'utf8'),
      contentType: 'text/typescript',
      metadata: {
        workspaceid: workspaceId,
        tenantid: tenantId,
        testid: canonicalTest.id,
        version: String(nextVersion),
      },
    });

    const createdArtifact = await this.prisma.$transaction(async (transaction) => {
      const artifact = await transaction.generatedTestArtifact.create({
        data: {
          workspaceId,
          canonicalTestId: canonicalTest.id,
          version: nextVersion,
          fileName: generated.fileName,
          storageKey,
          checksum,
          generatorVersion: generated.generatorVersion,
          status: 'CREATED',
          createdByUserId: auth.user.id,
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

      await transaction.canonicalTest.update({
        where: { id: canonicalTest.id },
        data: { status: 'GENERATED' },
      });

      return artifact;
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'generated_test.created',
      entityType: 'generated_test_artifact',
      entityId: createdArtifact.id,
      requestId,
      metadataJson: {
        canonicalTestId: canonicalTest.id,
        version: nextVersion,
        generatorVersion: generated.generatorVersion,
        promptVersion: generated.metadata.promptVersion,
        inferenceMode: generated.metadata.inferenceMode,
        model: generated.metadata.model ?? null,
      },
    });

    const validation = await this.testValidationQueue.enqueue({
      generatedTestArtifactId: createdArtifact.id,
      canonicalTestId: canonicalTest.id,
      workspaceId,
      tenantId,
      actorUserId: auth.user.id,
      requestId,
    });

    return {
      artifactId: createdArtifact.id,
      canonicalTestId: canonicalTest.id,
      version: nextVersion,
      fileName: generated.fileName,
      queued: validation === null,
      status: validation?.artifactStatus ?? 'VALIDATING',
      validationStatus: validation?.canonicalStatus ?? 'VALIDATING',
      summary: validation?.summary ?? 'Validation queued in worker-execution.',
      issues: validation?.issues ?? [],
    };
  }

  private async getNextRecordingVersion(workspaceId: string, filename: string) {
    const existing = await this.prisma.recordingAsset.findFirst({
      where: { workspaceId, filename },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return (existing?.version ?? 0) + 1;
  }

  private sanitizeStorageFileName(filename: string) {
    return filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  }


  private readPositiveInt(value: string | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw badRequest('PAGINATION_INVALID', 'Pagination values must be positive integers.');
    }

    return parsed;
  }

  private readPageSize(value: string | undefined) {
    return Math.min(this.readPositiveInt(value, 20), 100);
  }

  private readOptionalString(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private readRecordingStatus(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const statuses = new Set(['UPLOADED', 'PROCESSING', 'NORMALIZED', 'FAILED', 'ARCHIVED']);
    if (!statuses.has(value)) {
      throw badRequest('RECORDING_STATUS_INVALID', 'Recording status filter is invalid.');
    }

    return value as RecordingStatus;
  }

  private readTestStatus(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const statuses = new Set([
      'INGESTED',
      'GENERATED',
      'VALIDATING',
      'VALIDATED',
      'AUTO_REPAIRED',
      'NEEDS_HUMAN_REVIEW',
      'ARCHIVED',
    ]);
    if (!statuses.has(value)) {
      throw badRequest('TEST_STATUS_INVALID', 'Canonical test status filter is invalid.');
    }

    return value as TestStatus;
  }

  private readRunCreationBody(body: Record<string, unknown>) {
    const environmentId = typeof body['environmentId'] === 'string' ? body['environmentId'].trim() : '';
    const rawTestIds = Array.isArray(body['testIds']) ? body['testIds'] : [];
    const testIds = [...new Set(rawTestIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))];
    const requestedSourceMode = this.readExecutionSourceRequestMode(body['sourceMode']);
    const requestedGitRef = typeof body['gitRef'] === 'string' ? this.readOptionalString(body['gitRef']) ?? null : null;

    if (!environmentId || testIds.length === 0) {
      throw badRequest(
        'RUN_REQUEST_INVALID',
        'environmentId and at least one canonical test id are required to create a run.',
      );
    }

    return { environmentId, testIds, requestedSourceMode, requestedGitRef };
  }

  private readExecutionSourceRequestMode(value: unknown): ExecutionSourceRequestMode {
    if (
      value === ExecutionSourceRequestMode.PINNED_COMMIT ||
      value === ExecutionSourceRequestMode.BRANCH_HEAD ||
      value === ExecutionSourceRequestMode.SUITE_DEFAULT ||
      value === undefined
    ) {
      return (value as ExecutionSourceRequestMode | undefined) ?? ExecutionSourceRequestMode.SUITE_DEFAULT;
    }

    throw badRequest(
      'RUN_SOURCE_MODE_INVALID',
      'sourceMode must be SUITE_DEFAULT, PINNED_COMMIT, or BRANCH_HEAD.',
    );
  }

  private readRunStatus(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const statuses = new Set<RunStatus>([
      'QUEUED',
      'VALIDATING',
      'REPAIRING',
      'READY',
      'RUNNING',
      'PASSED',
      'FAILED',
      'CANCELED',
      'TIMED_OUT',
    ]);

    if (!statuses.has(value as RunStatus)) {
      throw badRequest('RUN_STATUS_INVALID', 'Run status filter is invalid.');
    }

    return value as RunStatus;
  }

  private readRepairMode(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const modes = new Set<RepairMode>(['RULE_BASED', 'LLM_ASSISTED']);
    if (!modes.has(value as RepairMode)) {
      throw badRequest('REPAIR_MODE_INVALID', 'Repair mode filter is invalid.');
    }

    return value as RepairMode;
  }

  private readRepairStatus(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const statuses = new Set<RepairStatus>([
      'SUGGESTED',
      'APPLIED',
      'RERUN_PASSED',
      'RERUN_FAILED',
      'ABANDONED',
      'HUMAN_REVIEW_REQUIRED',
    ]);

    if (!statuses.has(value as RepairStatus)) {
      throw badRequest('REPAIR_STATUS_INVALID', 'Repair status filter is invalid.');
    }

    return value as RepairStatus;
  }

  private readRunSortBy(value: string | undefined): 'createdAt' | 'status' | 'duration' {
    if (!value || value === 'createdAt') {
      return 'createdAt';
    }

    if (value === 'status') {
      return 'status';
    }

    if (value === 'duration') {
      return 'duration';
    }

    throw badRequest('RUN_SORT_INVALID', 'sortBy must be "createdAt", "status", or "duration".');
  }

  private readDate(value: string | undefined, code: string) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      throw badRequest(code, 'Date filters must be valid ISO timestamps or dates.');
    }

    return parsed;
  }

  private mapRun(
    run: Prisma.TestRunGetPayload<{
      include: {
        environment: { select: { id: true; name: true; baseUrl: true; isDefault: true } };
        triggeredBy: { select: { id: true; email: true; name: true } };
      };
    }>,
  ) {
    return {
      ...run,
      durationMs:
        run.startedAt && run.finishedAt
          ? new Date(run.finishedAt).valueOf() - new Date(run.startedAt).valueOf()
          : null,
    };
  }

  private async findValidationArtifactRecord(
    workspaceId: string,
    testId: string,
    artifactId: string,
    validationArtifactId: string,
  ): Promise<ArtifactDownloadRecord> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        id: validationArtifactId,
        workspaceId,
        generatedTestArtifactId: artifactId,
        generatedTestArtifact: {
          canonicalTestId: testId,
        },
      },
      select: {
        id: true,
        fileName: true,
        contentType: true,
        storageKey: true,
      },
    });

    if (!artifact) {
      throw notFound('VALIDATION_ARTIFACT_NOT_FOUND', 'Validation artifact was not found.');
    }

    return artifact;
  }

  private async findRunArtifactRecord(
    workspaceId: string,
    runId: string,
    itemId: string,
    artifactId: string,
  ): Promise<ArtifactDownloadRecord> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        id: artifactId,
        workspaceId,
        testRunId: runId,
        testRunItemId: itemId,
      },
      select: {
        id: true,
        fileName: true,
        contentType: true,
        storageKey: true,
      },
    });

    if (!artifact) {
      throw notFound('RUN_ARTIFACT_NOT_FOUND', 'Run artifact was not found.');
    }

    return artifact;
  }

  private resolveDownloadDisposition(contentType: string): ArtifactDownloadDisposition {
    return contentType.startsWith('image/') || contentType.startsWith('text/') ? 'inline' : 'attachment';
  }

  private buildSignedArtifactDownloadPath(workspaceId: string, token: string) {
    return `/api/v1/workspaces/${workspaceId}/artifact-downloads/${token}`;
  }

  private getArtifactDownloadTtlMs() {
    const raw = Number(process.env['ARTIFACT_DOWNLOAD_TTL_SECONDS'] ?? '900');
    const seconds = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 900;
    return seconds * 1000;
  }

  private createArtifactDownloadToken(payload: ArtifactDownloadTokenPayload) {
    const serialized = JSON.stringify(payload);
    const payloadToken = Buffer.from(serialized, 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.getArtifactSigningSecret())
      .update(payloadToken)
      .digest('base64url');
    return `${payloadToken}.${signature}`;
  }

  private readArtifactDownloadToken(token: string): ArtifactDownloadTokenPayload {
    const [payloadToken, signature] = token.split('.');
    if (!payloadToken || !signature) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    const expected = createHmac('sha256', this.getArtifactSigningSecret())
      .update(payloadToken)
      .digest();
    const received = Buffer.from(signature, 'base64url');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(payloadToken, 'base64url').toString('utf8'));
    } catch {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    if (!payload || typeof payload !== 'object') {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    const candidate = payload as Partial<ArtifactDownloadTokenPayload>;
    if (
      candidate.version !== 1 ||
      (candidate.kind !== 'run-artifact' && candidate.kind !== 'validation-artifact') ||
      typeof candidate.workspaceId !== 'string' ||
      typeof candidate.tenantId !== 'string' ||
      typeof candidate.actorUserId !== 'string' ||
      typeof candidate.artifactId !== 'string' ||
      (candidate.disposition !== 'inline' && candidate.disposition !== 'attachment') ||
      typeof candidate.expiresAt !== 'number'
    ) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    if (
      candidate.kind === 'run-artifact' &&
      (typeof candidate.runId !== 'string' || typeof candidate.itemId !== 'string')
    ) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    if (
      candidate.kind === 'validation-artifact' &&
      (typeof candidate.testId !== 'string' || typeof candidate.generatedArtifactId !== 'string')
    ) {
      throw badRequest('ARTIFACT_DOWNLOAD_URL_INVALID', 'Signed artifact download URL is invalid.');
    }

    return candidate as ArtifactDownloadTokenPayload;
  }

  private getArtifactSigningSecret() {
    return process.env['ARTIFACT_SIGNING_SECRET'] ?? process.env['API_SESSION_SECRET'] ?? 'dev-session-secret-change-in-prod';
  }
}

function calculatePercentage(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

function getRepairTrendInterval(since: Date, until: Date): 'day' | 'week' {
  const durationDays = Math.ceil((until.valueOf() - since.valueOf()) / 86_400_000);
  return durationDays > 60 ? 'week' : 'day';
}

function buildRepairTrendSeries(
  since: Date,
  until: Date,
  interval: 'day' | 'week',
  rows: Array<{ createdAt: Date; status: RepairStatus }>,
) {
  const buckets = new Map<string, {
    bucketStart: string;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
  }>();

  const cursor = interval === 'day' ? startOfDay(since) : startOfWeek(since);
  const lastBucket = interval === 'day' ? startOfDay(until) : startOfWeek(until);

  while (cursor.valueOf() <= lastBucket.valueOf()) {
    const key = cursor.toISOString();
    buckets.set(key, {
      bucketStart: key,
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      successRate: 0,
    });

    if (interval === 'day') {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  for (const row of rows) {
    const bucketDate = interval === 'day' ? startOfDay(row.createdAt) : startOfWeek(row.createdAt);
    const key = bucketDate.toISOString();
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }

    bucket.totalAttempts += 1;
    if (row.status === 'RERUN_PASSED') {
      bucket.successfulAttempts += 1;
    }

    if (row.status === 'RERUN_FAILED' || row.status === 'ABANDONED' || row.status === 'HUMAN_REVIEW_REQUIRED') {
      bucket.failedAttempts += 1;
    }
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    interval,
    successRate: calculatePercentage(bucket.successfulAttempts, bucket.totalAttempts),
  }));
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value;
}
