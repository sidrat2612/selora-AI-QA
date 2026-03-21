import { Injectable } from '@nestjs/common';
import { badRequest } from '../common/http-errors';
import { GitHubIntegrationService } from '../github/github-integration.service';

type ExecutionSourceRequestMode = 'SUITE_DEFAULT' | 'PINNED_COMMIT' | 'BRANCH_HEAD';
type ExecutionSourceMode = 'STORAGE_ARTIFACT' | 'PINNED_COMMIT' | 'BRANCH_HEAD';

type SelectedTestForExecution = {
  id: string;
  suiteId: string | null;
  suite: {
    id: string;
    name: string;
    executionSourcePolicy: ExecutionSourceMode;
    allowBranchHeadExecution: boolean;
    allowStorageExecutionFallback: boolean;
    gitExecutionEnabled: boolean;
  } | null;
  generatedArtifacts: Array<{
    id: string;
    publication: {
      id: string;
      targetPath: string;
      branchName: string;
      defaultBranch: string;
      headCommitSha: string | null;
      mergeCommitSha: string | null;
    } | null;
  }>;
};

type ResolvedExecutionSource = {
  canonicalTestId: string;
  generatedTestArtifactId: string;
  publicationId: string | null;
  requestedSourceMode: ExecutionSourceRequestMode;
  requestedGitRef: string | null;
  resolvedSourceMode: ExecutionSourceMode;
  resolvedGitRef: string | null;
  resolvedCommitSha: string | null;
  sourceFallbackReason: string | null;
};

type GitHubSuiteContext = {
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  token: string;
};

@Injectable()
export class ExecutionSourceResolverService {
  constructor(private readonly githubIntegrationService: GitHubIntegrationService) {}

  async resolveSources(input: {
    requestedSourceMode: ExecutionSourceRequestMode;
    requestedGitRef: string | null;
    tests: SelectedTestForExecution[];
  }): Promise<ResolvedExecutionSource[]> {
    const integrationCache = new Map<string, GitHubSuiteContext | null>();

    return Promise.all(
      input.tests.map((test) =>
        this.resolveForTest({
          requestedSourceMode: input.requestedSourceMode,
          requestedGitRef: input.requestedGitRef,
          test,
          integrationCache,
        }),
      ),
    );
  }

  private async resolveForTest(input: {
    requestedSourceMode: ExecutionSourceRequestMode;
    requestedGitRef: string | null;
    test: SelectedTestForExecution;
    integrationCache: Map<string, GitHubSuiteContext | null>;
  }): Promise<ResolvedExecutionSource> {
    const artifact = input.test.generatedArtifacts[0];
    if (!artifact) {
      throw badRequest(
        'RUN_SOURCE_ARTIFACT_MISSING',
        `Test ${input.test.id} does not have a READY artifact available for execution.`,
      );
    }

    const publication = artifact?.publication ?? null;
    const suite = input.test.suite;
    const policyMode = suite?.executionSourcePolicy ?? 'STORAGE_ARTIFACT';
    const desiredMode =
      input.requestedSourceMode === 'SUITE_DEFAULT'
        ? policyMode
        : input.requestedSourceMode === 'PINNED_COMMIT'
          ? 'PINNED_COMMIT'
          : 'BRANCH_HEAD';

    if (desiredMode === 'STORAGE_ARTIFACT') {
      return this.buildStorageResolution({
        artifactId: artifact.id,
        canonicalTestId: input.test.id,
        publicationId: publication?.id ?? null,
        requestedGitRef: input.requestedGitRef,
        requestedSourceMode: input.requestedSourceMode,
        reason: null,
      });
    }

    if (desiredMode === 'BRANCH_HEAD' && !suite?.allowBranchHeadExecution) {
      throw badRequest(
        'RUN_SOURCE_BRANCH_HEAD_FORBIDDEN',
        `Suite ${suite?.name ?? input.test.id} does not allow branch-head execution.`,
      );
    }

    if (!suite?.gitExecutionEnabled) {
      return this.fallbackOrThrow({
        artifactId: artifact.id,
        canonicalTestId: input.test.id,
        publicationId: publication?.id ?? null,
        requestedGitRef: input.requestedGitRef,
        requestedSourceMode: input.requestedSourceMode,
        allowFallback: Boolean(suite?.allowStorageExecutionFallback ?? true),
        reason: 'Git execution rollout is disabled for this suite. Falling back to the stored artifact.',
      });
    }

    if (!suite || !input.test.suiteId || !publication) {
      return this.fallbackOrThrow({
        artifactId: artifact.id,
        canonicalTestId: input.test.id,
        publicationId: publication?.id ?? null,
        requestedGitRef: input.requestedGitRef,
        requestedSourceMode: input.requestedSourceMode,
        allowFallback: Boolean(suite?.allowStorageExecutionFallback ?? true),
        reason:
          'Git execution requires a suite-scoped publication record. Falling back to the stored artifact.',
      });
    }

    const integration = await this.getGitHubSuiteContext(input.test.suiteId, input.integrationCache);
    if (!integration) {
      return this.fallbackOrThrow({
        artifactId: artifact.id,
        canonicalTestId: input.test.id,
        publicationId: publication.id,
        requestedGitRef: input.requestedGitRef,
        requestedSourceMode: input.requestedSourceMode,
        allowFallback: suite.allowStorageExecutionFallback,
        reason:
          'Git execution requires a connected GitHub integration with a resolvable token. Falling back to the stored artifact.',
      });
    }

    try {
      if (desiredMode === 'PINNED_COMMIT') {
        const requestedRef = input.requestedGitRef?.trim() || null;
        const resolvedCommitSha = requestedRef
          ? this.isCommitSha(requestedRef)
            ? requestedRef
            : await this.resolveGitRefToCommitSha(integration, requestedRef)
          : publication.mergeCommitSha ?? publication.headCommitSha;

        if (!resolvedCommitSha) {
          return this.fallbackOrThrow({
            artifactId: artifact.id,
            canonicalTestId: input.test.id,
            publicationId: publication.id,
            requestedGitRef: input.requestedGitRef,
            requestedSourceMode: input.requestedSourceMode,
            allowFallback: suite.allowStorageExecutionFallback,
            reason:
              'No merged or explicitly requested commit SHA was available for pinned execution. Falling back to the stored artifact.',
          });
        }

        return {
          canonicalTestId: input.test.id,
          generatedTestArtifactId: artifact.id,
          publicationId: publication.id,
          requestedSourceMode: input.requestedSourceMode,
          requestedGitRef: input.requestedGitRef,
          resolvedSourceMode: 'PINNED_COMMIT',
          resolvedGitRef: requestedRef ?? publication.branchName,
          resolvedCommitSha,
          sourceFallbackReason: null,
        };
      }

      const branchRef =
        input.requestedGitRef?.trim() || publication.defaultBranch || integration.defaultBranch;
      const resolvedCommitSha = await this.resolveGitRefToCommitSha(integration, branchRef);

      return {
        canonicalTestId: input.test.id,
        generatedTestArtifactId: artifact.id,
        publicationId: publication.id,
        requestedSourceMode: input.requestedSourceMode,
        requestedGitRef: input.requestedGitRef,
        resolvedSourceMode: 'BRANCH_HEAD',
        resolvedGitRef: branchRef,
        resolvedCommitSha,
        sourceFallbackReason: null,
      };
    } catch (error) {
      return this.fallbackOrThrow({
        artifactId: artifact.id,
        canonicalTestId: input.test.id,
        publicationId: publication.id,
        requestedGitRef: input.requestedGitRef,
        requestedSourceMode: input.requestedSourceMode,
        allowFallback: suite.allowStorageExecutionFallback,
        reason:
          error instanceof Error
            ? `${error.message} Falling back to the stored artifact.`
            : 'Git source resolution failed. Falling back to the stored artifact.',
      });
    }
  }

  private buildStorageResolution(input: {
    artifactId: string;
    canonicalTestId: string;
    publicationId: string | null;
    requestedSourceMode: ExecutionSourceRequestMode;
    requestedGitRef: string | null;
    reason: string | null;
  }): ResolvedExecutionSource {
    return {
      canonicalTestId: input.canonicalTestId,
      generatedTestArtifactId: input.artifactId,
      publicationId: input.publicationId,
      requestedSourceMode: input.requestedSourceMode,
      requestedGitRef: input.requestedGitRef,
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      resolvedGitRef: null,
      resolvedCommitSha: null,
      sourceFallbackReason: input.reason,
    };
  }

  private fallbackOrThrow(input: {
    artifactId: string;
    canonicalTestId: string;
    publicationId: string | null;
    requestedSourceMode: ExecutionSourceRequestMode;
    requestedGitRef: string | null;
    allowFallback: boolean;
    reason: string;
  }) {
    if (!input.allowFallback) {
      throw badRequest('RUN_SOURCE_RESOLUTION_FAILED', input.reason);
    }

    return this.buildStorageResolution({
      artifactId: input.artifactId,
      canonicalTestId: input.canonicalTestId,
      publicationId: input.publicationId,
      requestedSourceMode: input.requestedSourceMode,
      requestedGitRef: input.requestedGitRef,
      reason: input.reason,
    });
  }

  private async getGitHubSuiteContext(
    suiteId: string,
    cache: Map<string, GitHubSuiteContext | null>,
  ) {
    if (cache.has(suiteId)) {
      return cache.get(suiteId) ?? null;
    }

    try {
      const integration = await this.githubIntegrationService.getOperationalIntegrationBySuiteId(suiteId);
      const context =
        integration.record.status === 'CONNECTED' &&
        integration.token &&
        integration.record.repoOwner &&
        integration.record.repoName
          ? {
              repoOwner: integration.record.repoOwner,
              repoName: integration.record.repoName,
              defaultBranch: integration.record.defaultBranch,
              token: integration.token,
            }
          : null;
      cache.set(suiteId, context);
      return context;
    } catch {
      cache.set(suiteId, null);
      return null;
    }
  }

  private async resolveGitRefToCommitSha(integration: GitHubSuiteContext, ref: string) {
    const encodedRef = ref.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(
      `https://api.github.com/repos/${integration.repoOwner}/${integration.repoName}/commits/${encodedRef}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${integration.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Selora-Execution-Source-Resolver',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub could not resolve ref ${ref} (status ${response.status}).`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const sha = typeof payload['sha'] === 'string' ? payload['sha'] : null;
    if (!sha) {
      throw new Error(`GitHub did not return a commit SHA for ref ${ref}.`);
    }

    return sha;
  }

  private isCommitSha(value: string) {
    return /^[a-f0-9]{7,40}$/i.test(value);
  }
}
