import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  GitHubWebhookDeliveryStatus,
  Prisma,
  PublicationPullRequestState,
  PublicationStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { badRequest, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';
import { GitHubIntegrationService } from './github-integration.service';

const publicationSelect = {
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
} as const;

type PublicationRecord = Prisma.GeneratedArtifactPublicationGetPayload<{
  select: typeof publicationSelect;
}>;

type DeliveryRecord = Prisma.GitHubWebhookDeliveryGetPayload<{
  select: {
    id: true;
    tenantId: true;
    workspaceId: true;
    suiteId: true;
    githubIntegrationId: true;
    publicationId: true;
    deliveryId: true;
    eventName: true;
    action: true;
    status: true;
    payloadJson: true;
    processingAttempts: true;
    lastError: true;
    receivedAt: true;
    processedAt: true;
    replayedAt: true;
    githubIntegration: {
      select: {
        id: true;
        repoOwner: true;
        repoName: true;
      };
    };
  };
}>;

type PullRequestSummary = {
  number: number;
  url: string | null;
  state: PublicationPullRequestState;
  headSha: string | null;
  mergeCommitSha: string | null;
};

@Injectable()
export class GitHubPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly githubIntegrationService: GitHubIntegrationService,
  ) {}

  async publishArtifact(
    workspaceId: string,
    testId: string,
    artifactId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const artifact = await this.prisma.generatedTestArtifact.findFirst({
      where: {
        id: artifactId,
        workspaceId,
        canonicalTestId: testId,
      },
      include: {
        canonicalTest: {
          select: {
            id: true,
            name: true,
            suiteId: true,
            suite: {
              select: {
                id: true,
                slug: true,
                name: true,
                rolloutStage: true,
                githubPublishingEnabled: true,
              },
            },
          },
        },
      },
    });

    if (!artifact) {
      throw notFound('GENERATED_TEST_ARTIFACT_NOT_FOUND', 'Generated test artifact was not found.');
    }

    if (artifact.status !== 'READY') {
      throw badRequest(
        'GENERATED_TEST_ARTIFACT_NOT_READY',
        'Only validated artifacts in READY status can be published.',
      );
    }

    if (!artifact.canonicalTest.suiteId || !artifact.canonicalTest.suite) {
      throw badRequest(
        'SUITE_ASSIGNMENT_REQUIRED',
        'Assign this canonical test to a suite before attempting publication.',
      );
    }

    this.assertPublishingEnabled(artifact.canonicalTest.suite);

    const { record: integration, token, webhookSecret } =
      await this.githubIntegrationService.getOperationalIntegrationBySuiteId(artifact.canonicalTest.suiteId);

    if (integration.workspaceId !== workspaceId || integration.tenantId !== tenantId) {
      throw notFound('GITHUB_INTEGRATION_NOT_FOUND', 'GitHub integration was not found for this suite.');
    }

    if (integration.status !== 'CONNECTED') {
      throw badRequest(
        'GITHUB_INTEGRATION_INVALID',
        'GitHub integration must be connected and validated before publishing artifacts.',
      );
    }

    if (integration.allowedWriteScope === 'READ_ONLY') {
      throw badRequest(
        'GITHUB_WRITE_SCOPE_FORBIDDEN',
        'GitHub write scope is read-only. Update the suite integration before publishing.',
      );
    }

    if (!token) {
      throw badRequest(
        'GITHUB_CREDENTIAL_UNRESOLVED',
        'The stored GitHub credential cannot be resolved in this environment, so publication cannot continue.',
      );
    }

    if (!webhookSecret) {
      throw badRequest(
        'GITHUB_WEBHOOK_SECRET_UNRESOLVED',
        'The suite webhook secret cannot be resolved in this environment, so webhook reconciliation cannot be guaranteed.',
      );
    }

    const branchName = this.buildBranchName(
      artifact.canonicalTest.suite.slug,
      artifact.canonicalTest.name,
      artifact.version,
    );
    const targetPath = this.buildTargetPath(artifact.canonicalTest.suite.slug, artifact.fileName);
    const existingPublication = await this.prisma.generatedArtifactPublication.findUnique({
      where: { generatedTestArtifactId: artifact.id },
      select: {
        id: true,
        publishedAt: true,
        mergedAt: true,
      },
    });

    const baseBranchSha = await this.getBranchSha(
      integration.repoOwner,
      integration.repoName,
      integration.defaultBranch,
      token,
    );
    await this.ensureBranch(
      integration.repoOwner,
      integration.repoName,
      branchName,
      baseBranchSha,
      token,
    );

    const headCommitSha = await this.upsertArtifactFile({
      owner: integration.repoOwner,
      repo: integration.repoName,
      branchName,
      targetPath,
      content: await this.readArtifactSource(artifact.storageKey),
      commitMessage: `Publish ${artifact.canonicalTest.name} v${artifact.version}`,
      token,
    });

    const shouldUsePullRequest =
      integration.pullRequestRequired || integration.allowedWriteScope === 'PULL_REQUESTS';
    const pullRequest = shouldUsePullRequest
      ? await this.ensurePullRequest({
          owner: integration.repoOwner,
          repo: integration.repoName,
          branchName,
          defaultBranch: integration.defaultBranch,
          title: `Selora publish: ${artifact.canonicalTest.name} v${artifact.version}`,
          body: [
            `Automated publication for ${artifact.canonicalTest.name}.`,
            '',
            `Artifact: ${artifact.fileName}`,
            `Version: v${artifact.version}`,
            `Suite: ${artifact.canonicalTest.suite.name}`,
          ].join('\n'),
          token,
        })
      : null;

    const now = new Date();
    const publication = await this.prisma.generatedArtifactPublication.upsert({
      where: { generatedTestArtifactId: artifact.id },
      create: {
        tenantId,
        workspaceId,
        suiteId: artifact.canonicalTest.suite.id,
        githubIntegrationId: integration.id,
        canonicalTestId: artifact.canonicalTest.id,
        generatedTestArtifactId: artifact.id,
        createdByUserId: auth.user.id,
        idempotencyKey: `artifact:${artifact.id}`,
        status: pullRequest?.state === 'MERGED' ? PublicationStatus.MERGED : PublicationStatus.PUBLISHED,
        targetPath,
        branchName,
        defaultBranch: integration.defaultBranch,
        pullRequestNumber: pullRequest?.number ?? null,
        pullRequestUrl: pullRequest?.url ?? null,
        pullRequestState: pullRequest?.state ?? null,
        headCommitSha,
        mergeCommitSha: pullRequest?.mergeCommitSha ?? null,
        lastAttemptedAt: now,
        publishedAt: now,
        mergedAt: pullRequest?.state === 'MERGED' ? now : null,
      },
      update: {
        suiteId: artifact.canonicalTest.suite.id,
        githubIntegrationId: integration.id,
        canonicalTestId: artifact.canonicalTest.id,
        status: pullRequest?.state === 'MERGED' ? PublicationStatus.MERGED : PublicationStatus.PUBLISHED,
        targetPath,
        branchName,
        defaultBranch: integration.defaultBranch,
        pullRequestNumber: pullRequest?.number ?? null,
        pullRequestUrl: pullRequest?.url ?? null,
        pullRequestState: pullRequest?.state ?? null,
        headCommitSha,
        mergeCommitSha: pullRequest?.mergeCommitSha ?? null,
        lastError: null,
        lastAttemptedAt: now,
        publishedAt: existingPublication?.publishedAt ?? now,
        mergedAt:
          pullRequest?.state === 'MERGED' ? existingPublication?.mergedAt ?? now : null,
      },
      select: publicationSelect,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'github_publication.published',
      entityType: 'generated_artifact_publication',
      entityId: publication.id,
      requestId,
      metadataJson: {
        generatedTestArtifactId: artifact.id,
        branchName,
        targetPath,
        pullRequestNumber: pullRequest?.number ?? null,
      },
    });

    return this.toPublicationSummary(publication);
  }

  /**
   * Publish all READY artifacts for a suite to a single branch as a runnable
   * Playwright project. Creates/updates `selora/{suiteSlug}/latest` with a
   * playwright.config.ts and all spec files under `tests/`.
   */
  async publishSuite(
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Acquire a PostgreSQL session-level advisory lock keyed on the suiteId to
      // serialise concurrent publish calls for the same suite.
      const lockKey = this.advisoryLockKey(suiteId);
      await this.prisma.$executeRawUnsafe('SELECT pg_advisory_lock($1)', lockKey);

      try {
        return await this.publishSuiteInner(suiteId, auth, tenantId, requestId);
      } catch (err) {
        if (attempt >= maxAttempts) throw err;
        const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s
        console.warn(
          `[github-publication] publishSuite attempt ${attempt} failed, retrying in ${delay}ms:`,
          (err as Error).message ?? err,
        );
        await new Promise((r) => setTimeout(r, delay));
      } finally {
        await this.prisma.$executeRawUnsafe('SELECT pg_advisory_unlock($1)', lockKey).catch(() => {});
      }
    }

    return null;
  }

  private async publishSuiteInner(
    suiteId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        workspaceId: true,
        rolloutStage: true,
        githubPublishingEnabled: true,
      },
    });

    if (!suite) {
      return null;
    }

    if (!suite.githubPublishingEnabled) {
      return null;
    }

    let integration: Awaited<ReturnType<GitHubIntegrationService['getOperationalIntegrationBySuiteId']>>;
    try {
      integration = await this.githubIntegrationService.getOperationalIntegrationBySuiteId(suiteId);
    } catch {
      return null;
    }

    const { record: config, token, webhookSecret } = integration;
    if (config.status !== 'CONNECTED' || !token || config.allowedWriteScope === 'READ_ONLY') {
      return null;
    }

    const artifacts = await this.prisma.generatedTestArtifact.findMany({
      where: {
        workspaceId: suite.workspaceId,
        canonicalTest: { suiteId, status: { not: 'ARCHIVED' } },
        status: 'READY',
      },
      orderBy: { version: 'desc' },
      distinct: ['canonicalTestId'],
      select: {
        id: true,
        fileName: true,
        storageKey: true,
        version: true,
        canonicalTestId: true,
        canonicalTest: { select: { id: true, name: true } },
      },
    });

    if (artifacts.length === 0) {
      return null;
    }

    const suiteSlug = this.toSlug(suite.slug);
    const branchName = `selora/${suiteSlug}/latest`;
    const basePath = `selora/generated/${suiteSlug}`;

    const baseBranchSha = await this.getBranchSha(
      config.repoOwner,
      config.repoName,
      config.defaultBranch,
      token,
    );
    await this.ensureBranch(config.repoOwner, config.repoName, branchName, baseBranchSha, token);

    // Commit playwright.config.ts
    const playwrightConfig = this.buildPlaywrightConfig(suiteSlug);
    await this.upsertArtifactFile({
      owner: config.repoOwner,
      repo: config.repoName,
      branchName,
      targetPath: `${basePath}/playwright.config.ts`,
      content: playwrightConfig,
      commitMessage: `chore: update playwright config for ${suite.name}`,
      token,
    });

    // Commit each artifact
    let lastCommitSha: string | null = null;
    for (const artifact of artifacts) {
      const content = await this.readArtifactSource(artifact.storageKey);
      lastCommitSha = await this.upsertArtifactFile({
        owner: config.repoOwner,
        repo: config.repoName,
        branchName,
        targetPath: `${basePath}/tests/${artifact.fileName}`,
        content,
        commitMessage: `publish: ${artifact.canonicalTest.name} v${artifact.version}`,
        token,
      });

      // Upsert publication record per artifact
      const now = new Date();
      await this.prisma.generatedArtifactPublication.upsert({
        where: { generatedTestArtifactId: artifact.id },
        create: {
          tenantId,
          workspaceId: suite.workspaceId,
          suiteId,
          githubIntegrationId: config.id,
          canonicalTestId: artifact.canonicalTestId,
          generatedTestArtifactId: artifact.id,
          createdByUserId: auth.user.id,
          idempotencyKey: `suite-publish:${artifact.id}`,
          status: PublicationStatus.PUBLISHED,
          targetPath: `${basePath}/tests/${artifact.fileName}`,
          branchName,
          defaultBranch: config.defaultBranch,
          headCommitSha: lastCommitSha,
          lastAttemptedAt: now,
          publishedAt: now,
        },
        update: {
          suiteId,
          githubIntegrationId: config.id,
          canonicalTestId: artifact.canonicalTestId,
          status: PublicationStatus.PUBLISHED,
          targetPath: `${basePath}/tests/${artifact.fileName}`,
          branchName,
          defaultBranch: config.defaultBranch,
          headCommitSha: lastCommitSha,
          lastError: null,
          lastAttemptedAt: now,
        },
      });
    }

    // Create / update a single long-lived PR for the suite
    const shouldUsePullRequest =
      config.pullRequestRequired || config.allowedWriteScope === 'PULL_REQUESTS';
    const pullRequest = shouldUsePullRequest
      ? await this.ensurePullRequest({
          owner: config.repoOwner,
          repo: config.repoName,
          branchName,
          defaultBranch: config.defaultBranch,
          title: `Selora suite: ${suite.name}`,
          body: [
            `Automated suite publication for **${suite.name}**.`,
            '',
            `Contains ${artifacts.length} test artifact(s).`,
            '',
            `Branch: \`${branchName}\``,
          ].join('\n'),
          token,
        })
      : null;

    // Update PR info on all publications if a PR was created
    if (pullRequest) {
      await this.prisma.generatedArtifactPublication.updateMany({
        where: { branchName, suiteId },
        data: {
          pullRequestNumber: pullRequest.number,
          pullRequestUrl: pullRequest.url,
          pullRequestState: pullRequest.state,
          mergeCommitSha: pullRequest.mergeCommitSha,
        },
      });
    }

    await this.auditService.record({
      tenantId,
      workspaceId: suite.workspaceId,
      actorUserId: auth.user.id,
      eventType: 'github_publication.suite_published',
      entityType: 'automation_suite',
      entityId: suiteId,
      requestId,
      metadataJson: {
        branchName,
        artifactCount: artifacts.length,
        pullRequestNumber: pullRequest?.number ?? null,
      },
    });

    return {
      suiteId,
      branchName,
      artifactCount: artifacts.length,
      pullRequestNumber: pullRequest?.number ?? null,
      pullRequestUrl: pullRequest?.url ?? null,
      headCommitSha: lastCommitSha,
    };
  }

  /**
   * Best-effort cleanup of the suite's auto-publish branch and any open PR
   * when the GitHub integration is disconnected or the suite is archived.
   */
  async cleanupSuiteBranch(input: {
    suiteSlug: string;
    repoOwner: string;
    repoName: string;
    defaultBranch: string;
    token: string;
  }) {
    const branchName = `selora/${this.toSlug(input.suiteSlug)}/latest`;

    // Close the open PR, if any
    try {
      const openPull = await this.findPullRequest(
        {
          owner: input.repoOwner,
          repo: input.repoName,
          branchName,
          defaultBranch: input.defaultBranch,
          title: '',
          body: '',
          token: input.token,
        },
        'open',
      );
      if (openPull) {
        await this.githubFetch(
          input.repoOwner,
          input.repoName,
          `/pulls/${openPull.number}`,
          input.token,
          {
            method: 'PATCH',
            body: JSON.stringify({ state: 'closed' }),
          },
        );
      }
    } catch {
      // best-effort
    }

    // Delete the branch
    try {
      await this.githubFetch(
        input.repoOwner,
        input.repoName,
        `/git/refs/heads/${branchName}`,
        input.token,
        { method: 'DELETE' },
        true,
      );
    } catch {
      // best-effort
    }
  }

  async replayPublication(
    workspaceId: string,
    testId: string,
    artifactId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const publication = await this.prisma.generatedArtifactPublication.findFirst({
      where: {
        workspaceId,
        generatedTestArtifactId: artifactId,
        canonicalTestId: testId,
      },
      include: {
        suite: {
          select: {
            id: true,
            rolloutStage: true,
            githubPublishingEnabled: true,
          },
        },
        webhookDeliveries: {
          where: { status: GitHubWebhookDeliveryStatus.FAILED },
          orderBy: { receivedAt: 'asc' },
          select: { id: true },
        },
      },
    });

    if (!publication) {
      throw notFound('PUBLICATION_NOT_FOUND', 'Publication record was not found for this artifact.');
    }

    if (publication.tenantId !== tenantId) {
      throw notFound('PUBLICATION_NOT_FOUND', 'Publication record was not found for this artifact.');
    }

    if (!publication.suite) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found for this publication.');
    }

    this.assertPublishingEnabled(publication.suite);

    let replayedCount = 0;
    for (const delivery of publication.webhookDeliveries) {
      await this.processStoredDelivery(delivery.id, { replayedAt: new Date() });
      replayedCount += 1;
    }

    const refreshed = await this.prisma.generatedArtifactPublication.findUnique({
      where: { id: publication.id },
      select: publicationSelect,
    });

    if (!refreshed) {
      throw notFound('PUBLICATION_NOT_FOUND', 'Publication record was not found for this artifact.');
    }

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'github_publication.replayed',
      entityType: 'generated_artifact_publication',
      entityId: publication.id,
      requestId,
      metadataJson: {
        replayedCount,
      },
    });

    return {
      replayedCount,
      publication: this.toPublicationSummary(refreshed),
    };
  }

  async handleIncomingWebhook(
    suiteId: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
    payload: Record<string, unknown>,
  ) {
    if (!rawBody) {
      throw badRequest(
        'GITHUB_WEBHOOK_RAW_BODY_REQUIRED',
        'GitHub webhook verification requires raw request bytes. Enable raw body support and retry.',
      );
    }

    const { record: integration, webhookSecret } =
      await this.githubIntegrationService.getOperationalIntegrationBySuiteId(suiteId);

    if (!webhookSecret) {
      throw badRequest(
        'GITHUB_WEBHOOK_SECRET_UNRESOLVED',
        'Webhook secret cannot be resolved for this suite integration.',
      );
    }

    const signatureHeader = this.readHeader(headers, 'x-hub-signature-256');
    const deliveryId = this.readHeader(headers, 'x-github-delivery');
    const eventName = this.readHeader(headers, 'x-github-event');
    this.assertWebhookSignature(signatureHeader, rawBody, webhookSecret);

    const existing = await this.prisma.gitHubWebhookDelivery.findUnique({
      where: {
        githubIntegrationId_deliveryId: {
          githubIntegrationId: integration.id,
          deliveryId,
        },
      },
      select: {
        id: true,
        deliveryId: true,
        status: true,
      },
    });

    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        deliveryId: existing.deliveryId,
        status: existing.status,
      };
    }

    const delivery = await this.prisma.gitHubWebhookDelivery.create({
      data: {
        tenantId: integration.tenantId,
        workspaceId: integration.workspaceId,
        suiteId: integration.suiteId,
        githubIntegrationId: integration.id,
        deliveryId,
        eventName,
        action: typeof payload['action'] === 'string' ? payload['action'] : null,
        payloadJson: payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    const processed = await this.processStoredDelivery(delivery.id);
    return {
      accepted: true,
      duplicate: false,
      deliveryId,
      status: processed.status,
    };
  }

  toPublicationSummary(record: PublicationRecord) {
    const deliveries = record.webhookDeliveries.map((delivery) => ({
      id: delivery.id,
      deliveryId: delivery.deliveryId,
      eventName: delivery.eventName,
      action: delivery.action,
      status: delivery.status,
      processingAttempts: delivery.processingAttempts,
      lastError: delivery.lastError,
      receivedAt: delivery.receivedAt,
      processedAt: delivery.processedAt,
      replayedAt: delivery.replayedAt,
    }));

    return {
      id: record.id,
      generatedTestArtifactId: record.generatedTestArtifactId,
      status: record.status,
      targetPath: record.targetPath,
      branchName: record.branchName,
      defaultBranch: record.defaultBranch,
      pullRequestNumber: record.pullRequestNumber,
      pullRequestUrl: record.pullRequestUrl,
      pullRequestState: record.pullRequestState,
      headCommitSha: record.headCommitSha,
      mergeCommitSha: record.mergeCommitSha,
      lastError: record.lastError,
      lastAttemptedAt: record.lastAttemptedAt,
      publishedAt: record.publishedAt,
      mergedAt: record.mergedAt,
      lastWebhookEventAt: record.lastWebhookEventAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      recentDeliveries: deliveries,
      deliveryStats: {
        total: deliveries.length,
        failed: deliveries.filter((delivery) => delivery.status === 'FAILED').length,
        processed: deliveries.filter((delivery) => delivery.status === 'PROCESSED').length,
      },
    };
  }

  private async processStoredDelivery(
    deliveryId: string,
    options?: { replayedAt?: Date },
  ) {
    const delivery = await this.prisma.gitHubWebhookDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        suiteId: true,
        githubIntegrationId: true,
        publicationId: true,
        deliveryId: true,
        eventName: true,
        action: true,
        status: true,
        payloadJson: true,
        processingAttempts: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
        replayedAt: true,
        githubIntegration: {
          select: {
            id: true,
            repoOwner: true,
            repoName: true,
          },
        },
      },
    });

    if (!delivery) {
      throw notFound('WEBHOOK_DELIVERY_NOT_FOUND', 'Webhook delivery was not found.');
    }

    try {
      const payload = this.asRecord(delivery.payloadJson);
      if (!payload) {
        throw new Error('Webhook payload was malformed.');
      }

      if (delivery.eventName !== 'pull_request') {
        return this.finalizeDelivery(delivery, GitHubWebhookDeliveryStatus.IGNORED, null, null, options);
      }

      const repository = this.asRecord(payload['repository']);
      const owner = this.asRecord(repository?.['owner']);
      const repoOwner = typeof owner?.['login'] === 'string' ? owner['login'] : null;
      const repoName = typeof repository?.['name'] === 'string' ? repository['name'] : null;

      if (
        repoOwner !== delivery.githubIntegration.repoOwner ||
        repoName !== delivery.githubIntegration.repoName
      ) {
        return this.finalizeDelivery(
          delivery,
          GitHubWebhookDeliveryStatus.IGNORED,
          null,
          null,
          options,
        );
      }

      const pullRequest = this.asRecord(payload['pull_request']);
      const head = this.asRecord(pullRequest?.['head']);
      const branchName = typeof head?.['ref'] === 'string' ? head['ref'] : null;
      const headSha = typeof head?.['sha'] === 'string' ? head['sha'] : null;
      const pullRequestNumber = this.readNumber(pullRequest?.['number']) ?? this.readNumber(payload['number']);
      const merged = Boolean(pullRequest?.['merged']);
      const mergeCommitSha = typeof pullRequest?.['merge_commit_sha'] === 'string'
        ? pullRequest['merge_commit_sha']
        : null;
      const pullRequestUrl = typeof pullRequest?.['html_url'] === 'string' ? pullRequest['html_url'] : null;

      if (!branchName && !pullRequestNumber) {
        throw new Error('Webhook payload did not include a branch or pull request number.');
      }

      const publication = await this.prisma.generatedArtifactPublication.findFirst({
        where: {
          githubIntegrationId: delivery.githubIntegrationId,
          OR: [
            ...(branchName ? [{ branchName }] : []),
            ...(pullRequestNumber ? [{ pullRequestNumber }] : []),
          ],
        },
        select: {
          id: true,
          status: true,
          mergedAt: true,
        },
      });

      if (!publication) {
        return this.finalizeDelivery(
          delivery,
          GitHubWebhookDeliveryStatus.IGNORED,
          null,
          null,
          options,
        );
      }

      const publicationStatus = merged
        ? PublicationStatus.MERGED
        : delivery.action === 'closed'
          ? PublicationStatus.CLOSED
          : PublicationStatus.PUBLISHED;
      const pullRequestState = merged
        ? PublicationPullRequestState.MERGED
        : delivery.action === 'closed'
          ? PublicationPullRequestState.CLOSED
          : PublicationPullRequestState.OPEN;
      const now = new Date();

      await this.prisma.$transaction([
        this.prisma.generatedArtifactPublication.update({
          where: { id: publication.id },
          data: {
            status: publicationStatus,
            pullRequestNumber: pullRequestNumber ?? undefined,
            pullRequestUrl,
            pullRequestState,
            headCommitSha: headSha,
            mergeCommitSha,
            lastError: null,
            lastWebhookEventAt: now,
            mergedAt: merged ? publication.mergedAt ?? now : publication.mergedAt,
          },
        }),
        this.prisma.gitHubWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            publicationId: publication.id,
            status: GitHubWebhookDeliveryStatus.PROCESSED,
            processingAttempts: delivery.processingAttempts + 1,
            lastError: null,
            processedAt: now,
            replayedAt: options?.replayedAt ?? delivery.replayedAt,
          },
        }),
      ]);

      await this.auditService.record({
        tenantId: delivery.tenantId,
        workspaceId: delivery.workspaceId,
        eventType:
          publicationStatus === PublicationStatus.MERGED
            ? 'github_publication.merged'
            : publicationStatus === PublicationStatus.CLOSED
              ? 'github_publication.closed'
              : 'github_publication.reconciled',
        entityType: 'generated_artifact_publication',
        entityId: publication.id,
        metadataJson: {
          deliveryId: delivery.deliveryId,
          action: delivery.action,
          pullRequestNumber,
          headSha,
          mergeCommitSha,
        },
      });

      const refreshed = await this.prisma.gitHubWebhookDelivery.findUnique({
        where: { id: delivery.id },
        select: {
          id: true,
          tenantId: true,
          workspaceId: true,
          suiteId: true,
          githubIntegrationId: true,
          publicationId: true,
          deliveryId: true,
          eventName: true,
          action: true,
          status: true,
          payloadJson: true,
          processingAttempts: true,
          lastError: true,
          receivedAt: true,
          processedAt: true,
          replayedAt: true,
          githubIntegration: {
            select: {
              id: true,
              repoOwner: true,
              repoName: true,
            },
          },
        },
      });

      if (!refreshed) {
        throw notFound('WEBHOOK_DELIVERY_NOT_FOUND', 'Webhook delivery was not found.');
      }

      return refreshed;
    } catch (error) {
      await this.prisma.gitHubWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: GitHubWebhookDeliveryStatus.FAILED,
          processingAttempts: delivery.processingAttempts + 1,
          lastError: error instanceof Error ? error.message : 'Webhook processing failed.',
          processedAt: new Date(),
          replayedAt: options?.replayedAt ?? delivery.replayedAt,
        },
      });

      return this.prisma.gitHubWebhookDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
        select: {
          id: true,
          tenantId: true,
          workspaceId: true,
          suiteId: true,
          githubIntegrationId: true,
          publicationId: true,
          deliveryId: true,
          eventName: true,
          action: true,
          status: true,
          payloadJson: true,
          processingAttempts: true,
          lastError: true,
          receivedAt: true,
          processedAt: true,
          replayedAt: true,
          githubIntegration: {
            select: {
              id: true,
              repoOwner: true,
              repoName: true,
            },
          },
        },
      });
    }
  }

  private async finalizeDelivery(
    delivery: DeliveryRecord,
    status: GitHubWebhookDeliveryStatus,
    publicationId: string | null,
    errorMessage: string | null,
    options?: { replayedAt?: Date },
  ) {
    const now = new Date();
    return this.prisma.gitHubWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        publicationId,
        status,
        processingAttempts: delivery.processingAttempts + 1,
        lastError: errorMessage,
        processedAt: now,
        replayedAt: options?.replayedAt ?? delivery.replayedAt,
      },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        suiteId: true,
        githubIntegrationId: true,
        publicationId: true,
        deliveryId: true,
        eventName: true,
        action: true,
        status: true,
        payloadJson: true,
        processingAttempts: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
        replayedAt: true,
        githubIntegration: {
          select: {
            id: true,
            repoOwner: true,
            repoName: true,
          },
        },
      },
    });
  }

  private assertPublishingEnabled(suite: {
    id: string;
    rolloutStage: string;
    githubPublishingEnabled: boolean;
  }) {
    if (suite.githubPublishingEnabled) {
      return;
    }

    throw badRequest(
      'GITHUB_PUBLISHING_DISABLED',
      `GitHub publication is disabled for this suite while rollout is in ${suite.rolloutStage} stage.`,
    );
  }

  private async readArtifactSource(storageKey: string) {
    const { readStoredText, getStorageConfig } = await import('@selora/storage');
    return readStoredText({
      config: getStorageConfig(),
      key: storageKey,
    });
  }

  private async ensurePullRequest(input: {
    owner: string;
    repo: string;
    branchName: string;
    defaultBranch: string;
    title: string;
    body: string;
    token: string;
  }): Promise<PullRequestSummary> {
    const openPull = await this.findPullRequest(input, 'open');
    if (openPull) {
      return openPull;
    }

    const closedPull = await this.findPullRequest(input, 'closed');
    if (closedPull && closedPull.state !== 'MERGED') {
      const response = await this.githubFetch(
        input.owner,
        input.repo,
        `/pulls/${closedPull.number}`,
        input.token,
        {
          method: 'PATCH',
          body: JSON.stringify({ state: 'open' }),
        },
      );
      return this.readPullRequestSummary((await response.json()) as Record<string, unknown>);
    }

    const response = await this.githubFetch(input.owner, input.repo, '/pulls', input.token, {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        head: input.branchName,
        base: input.defaultBranch,
        body: input.body,
        maintainer_can_modify: true,
      }),
    });

    return this.readPullRequestSummary((await response.json()) as Record<string, unknown>);
  }

  private async findPullRequest(
    input: {
      owner: string;
      repo: string;
      branchName: string;
      defaultBranch: string;
      title: string;
      body: string;
      token: string;
    },
    state: 'open' | 'closed',
  ) {
    const query = new URLSearchParams({
      state,
      head: `${input.owner}:${input.branchName}`,
      base: input.defaultBranch,
    });
    const response = await this.githubFetch(
      input.owner,
      input.repo,
      `/pulls?${query.toString()}`,
      input.token,
    );
    const payload = (await response.json()) as Record<string, unknown>[];
    const first = payload[0];
    return first ? this.readPullRequestSummary(first) : null;
  }

  private readPullRequestSummary(payload: Record<string, unknown>): PullRequestSummary {
    const merged = Boolean(payload['merged']) || typeof payload['merged_at'] === 'string';
    return {
      number: this.readNumber(payload['number']) ?? 0,
      url: typeof payload['html_url'] === 'string' ? payload['html_url'] : null,
      state: merged
        ? PublicationPullRequestState.MERGED
        : payload['state'] === 'closed'
          ? PublicationPullRequestState.CLOSED
          : PublicationPullRequestState.OPEN,
      headSha:
        typeof this.asRecord(payload['head'])?.['sha'] === 'string'
          ? String(this.asRecord(payload['head'])?.['sha'])
          : null,
      mergeCommitSha: typeof payload['merge_commit_sha'] === 'string' ? payload['merge_commit_sha'] : null,
    };
  }

  private async upsertArtifactFile(input: {
    owner: string;
    repo: string;
    branchName: string;
    targetPath: string;
    content: string;
    commitMessage: string;
    token: string;
  }) {
    const encodedPath = input.targetPath.split('/').map(encodeURIComponent).join('/');
    const existingResponse = await this.githubFetch(
      input.owner,
      input.repo,
      `/contents/${encodedPath}?${new URLSearchParams({ ref: input.branchName }).toString()}`,
      input.token,
      undefined,
      true,
    );

    let existingSha: string | undefined;
    if (existingResponse.status !== 404) {
      const existingPayload = (await existingResponse.json()) as Record<string, unknown>;
      existingSha = typeof existingPayload['sha'] === 'string' ? existingPayload['sha'] : undefined;
      if (
        typeof existingPayload['content'] === 'string' &&
        this.decodeGitHubContent(existingPayload['content']) === input.content
      ) {
        return this.getBranchSha(input.owner, input.repo, input.branchName, input.token);
      }
    }

    const response = await this.githubFetch(
      input.owner,
      input.repo,
      `/contents/${encodedPath}`,
      input.token,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: input.commitMessage,
          content: Buffer.from(input.content, 'utf8').toString('base64'),
          branch: input.branchName,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      },
    );

    const payload = (await response.json()) as Record<string, unknown>;
    const commit = this.asRecord(payload['commit']);
    const commitSha = typeof commit?.['sha'] === 'string' ? commit['sha'] : null;
    if (!commitSha) {
      throw badRequest('GITHUB_COMMIT_FAILED', 'GitHub did not return a commit SHA for the publication write.');
    }

    return commitSha;
  }

  private async ensureBranch(
    owner: string,
    repo: string,
    branchName: string,
    baseSha: string,
    token: string,
  ) {
    const existing = await this.githubFetch(
      owner,
      repo,
      `/git/ref/heads/${branchName}`,
      token,
      undefined,
      true,
    );
    if (existing.status !== 404) {
      return;
    }

    await this.githubFetch(owner, repo, '/git/refs', token, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });
  }

  private async getBranchSha(owner: string, repo: string, branchName: string, token: string) {
    const response = await this.githubFetch(owner, repo, `/git/ref/heads/${branchName}`, token);
    const payload = (await response.json()) as Record<string, unknown>;
    const object = this.asRecord(payload['object']);
    const sha = typeof object?.['sha'] === 'string' ? object['sha'] : null;
    if (!sha) {
      throw badRequest('GITHUB_BRANCH_INVALID', 'GitHub did not return a branch SHA for the configured branch.');
    }

    return sha;
  }

  private async githubFetch(
    owner: string,
    repo: string,
    path: string,
    token: string,
    init?: RequestInit,
    allowNotFound = false,
  ) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Selora-GitHub-Publication',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
    });

    if (allowNotFound && response.status === 404) {
      return response;
    }

    if (!response.ok) {
      const message = await response.text().catch(() => 'GitHub request failed.');
      throw badRequest(
        'GITHUB_REQUEST_FAILED',
        `GitHub request failed with status ${response.status}: ${message.slice(0, 200)}`,
      );
    }

    return response;
  }

  private buildPlaywrightConfig(suiteSlug: string) {
    return [
      `import { defineConfig } from '@playwright/test';`,
      ``,
      `export default defineConfig({`,
      `  testDir: './tests',`,
      `  timeout: 60_000,`,
      `  retries: 1,`,
      `  use: {`,
      `    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',`,
      `    trace: 'on-first-retry',`,
      `    screenshot: 'only-on-failure',`,
      `  },`,
      `  reporter: [['json', { outputFile: 'report.json' }], ['html', { open: 'never' }]],`,
      `});`,
      ``,
    ].join('\n');
  }

  private buildSuiteBranchName(suiteSlug: string) {
    return `selora/${this.toSlug(suiteSlug)}/latest`;
  }

  private buildBranchName(suiteSlug: string, testName: string, version: number) {
    return `selora/${this.toSlug(suiteSlug)}/${this.toSlug(testName).slice(0, 48)}/v${version}`;
  }

  private buildTargetPath(suiteSlug: string, fileName: string) {
    return `selora/generated/${this.toSlug(suiteSlug)}/${fileName.replace(/^\/+/, '')}`;
  }

  private toSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  /** Derive a stable 32-bit integer from a CUID for pg_advisory_xact_lock. */
  private advisoryLockKey(id: string): number {
    const hash = createHash('md5').update(`publish-suite:${id}`).digest();
    return hash.readInt32BE(0);
  }

  private decodeGitHubContent(content: string) {
    return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const direct = headers[name] ?? headers[name.toLowerCase()];
    const value = Array.isArray(direct) ? direct[0] : direct;
    if (!value) {
      throw badRequest('GITHUB_WEBHOOK_HEADER_REQUIRED', `${name} header is required.`);
    }

    return value;
  }

  private assertWebhookSignature(signatureHeader: string, rawBody: Buffer, secret: string) {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signatureHeader, 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw badRequest('GITHUB_WEBHOOK_SIGNATURE_INVALID', 'GitHub webhook signature verification failed.');
    }
  }

  private asRecord(value: unknown) {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  async listPublicationsForSuite(workspaceId: string, suiteId: string) {
    return this.prisma.generatedArtifactPublication.findMany({
      where: { workspaceId, suiteId },
      select: publicationSelect,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async replaySingleDelivery(
    workspaceId: string,
    suiteId: string,
    deliveryId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const delivery = await this.prisma.gitHubWebhookDelivery.findFirst({
      where: { id: deliveryId, workspaceId, suiteId },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        suiteId: true,
        githubIntegrationId: true,
        publicationId: true,
        deliveryId: true,
        eventName: true,
        action: true,
        status: true,
        payloadJson: true,
        processingAttempts: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
        replayedAt: true,
        githubIntegration: {
          select: {
            id: true,
            repoOwner: true,
            repoName: true,
          },
        },
      },
    });

    if (!delivery || delivery.tenantId !== tenantId) {
      throw notFound('GITHUB_DELIVERY_NOT_FOUND', 'Webhook delivery was not found.');
    }

    if (delivery.status !== GitHubWebhookDeliveryStatus.FAILED) {
      throw badRequest('GITHUB_DELIVERY_NOT_FAILED', 'Only failed deliveries can be replayed.');
    }

    await this.processStoredDelivery(delivery.id, { replayedAt: new Date() });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'github_webhook_delivery.replayed',
      entityType: 'github_webhook_delivery',
      entityId: deliveryId,
      requestId,
      metadataJson: { eventName: delivery.eventName, action: delivery.action },
    });

    return { replayed: true, deliveryId };
  }
}
