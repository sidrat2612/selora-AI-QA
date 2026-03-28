import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { success } from '../common/response';
import { GitHubPublicationService } from './github-publication.service';
import { SmartSelectionService } from '../recordings/smart-selection.service';
import { RecordingsService } from '../recordings/recordings.service';
import { PrismaService } from '../database/prisma.service';

type WebhookRequest = Request & { rawBody?: Buffer };

@Controller('github')
@UseGuards(ThrottlerGuard)
@Throttle({ webhook: { limit: 60, ttl: 60_000 } })
export class GitHubWebhookController {
  constructor(
    private readonly githubPublicationService: GitHubPublicationService,
    private readonly smartSelectionService: SmartSelectionService,
    private readonly recordingsService: RecordingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('webhooks/:suiteId')
  async handleSuiteWebhook(
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: WebhookRequest,
  ) {
    return success(
      await this.githubPublicationService.handleIncomingWebhook(
        suiteId,
        request.rawBody,
        request.headers,
        body,
      ),
    );
  }

  /**
   * POST /github/webhooks/:suiteId/pr-smart-select
   * Auto-trigger smart test selection when a pull request is opened or synchronized.
   */
  @Post('webhooks/:suiteId/pr-smart-select')
  async handlePRSmartSelection(
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: WebhookRequest,
  ) {
    const action = body['action'] as string | undefined;
    const pr = body['pull_request'] as Record<string, unknown> | undefined;
    const repo = body['repository'] as Record<string, unknown> | undefined;

    // Only process opened/synchronize events
    if (!action || !['opened', 'synchronize', 'reopened'].includes(action)) {
      return success({ skipped: true, reason: `Ignoring action: ${action}` });
    }

    if (!pr || !repo) {
      return success({ skipped: true, reason: 'Missing pull_request or repository payload' });
    }

    const repoOwner = (repo['owner'] as Record<string, unknown>)?.['login'] as string ?? '';
    const repoName = repo['name'] as string ?? '';
    const baseSha = (pr['base'] as Record<string, unknown>)?.['sha'] as string ?? '';
    const headSha = (pr['head'] as Record<string, unknown>)?.['sha'] as string ?? '';
    const pullRequestNumber = pr['number'] as number | undefined;

    // Get changed files from the PR
    const changedFiles = (body['changed_files'] as string[]) ?? [];

    // Look up the suite's workspace
    const suite = await this.prisma.automationSuite.findUnique({
      where: { id: suiteId },
      select: { id: true, workspaceId: true },
    });

    if (!suite) {
      return success({ skipped: true, reason: 'Suite not found' });
    }

    // Run smart selection analysis
    const selection = await this.smartSelectionService.selectTests(
      suite.workspaceId,
      suiteId,
      {
        repoOwner,
        repoName,
        baseSha,
        headSha,
        pullRequestNumber,
        changedFiles,
      },
    );

    return success({
      triggered: true,
      pullRequestNumber,
      selectedCount: selection.selectedCount,
      randomSampleCount: selection.randomSampleCount,
      totalTests: selection.totalTests,
      coverageConfidence: selection.coverageConfidence,
    });
  }
}
