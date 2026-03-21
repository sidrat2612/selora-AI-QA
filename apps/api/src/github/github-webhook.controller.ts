import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { success } from '../common/response';
import { GitHubPublicationService } from './github-publication.service';

type WebhookRequest = Request & { rawBody?: Buffer };

@Controller('github')
export class GitHubWebhookController {
  constructor(private readonly githubPublicationService: GitHubPublicationService) {}

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
}
