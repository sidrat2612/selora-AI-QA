import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response, Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { PrismaService } from '../database/prisma.service';
import { notFound } from '../common/http-errors';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import {
  createRedisSubscriber,
  getQueueMode,
  runLogChannel,
  type RunLogEvent,
} from '@selora/queue';
import { getStorageConfig, readStoredText } from '@selora/storage';

@Controller('api/v1/workspaces/:workspaceId')
export class RunConsoleController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SSE endpoint — streams live Playwright log lines for a running test item.
   * GET /workspaces/:workspaceId/runs/:runId/items/:itemId/console/live
   */
  @Get('runs/:runId/items/:itemId/console/live')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async streamLiveLogs(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Param('itemId') itemId: string,
    @Req() _request: Request,
    @Res() response: Response,
  ) {
    const item = await this.prisma.testRunItem.findFirst({
      where: { id: itemId, testRunId: runId, testRun: { workspaceId } },
      select: { id: true, status: true },
    });

    if (!item) {
      throw notFound('RUN_ITEM_NOT_FOUND', 'Test run item was not found.');
    }

    // Set up SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });
    response.flushHeaders();

    // If Redis is not available (inline queue mode), just end immediately
    if (getQueueMode() === 'inline') {
      response.write(`data: ${JSON.stringify({ stream: 'system', line: 'Live streaming unavailable (inline queue mode)', ts: Date.now() })}\n\n`);
      response.write('event: done\ndata: {}\n\n');
      response.end();
      return;
    }

    const channel = runLogChannel(itemId);
    const subscriber = createRedisSubscriber();

    const sendEvent = (event: RunLogEvent) => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Subscribe to the Redis channel for this run item
    subscriber.on('message', (subscribedChannel: string, message: string) => {
      if (subscribedChannel !== channel) return;
      try {
        const event: RunLogEvent = JSON.parse(message);
        sendEvent(event);

        // If the worker sent a [done] message, close the stream
        if (event.stream === 'system' && event.line.startsWith('[done]')) {
          response.write('event: done\ndata: {}\n\n');
          cleanup();
        }
      } catch {
        // Ignore malformed messages
      }
    });
    await subscriber.subscribe(channel);

    // Send a heartbeat every 15s to keep the connection alive
    const heartbeat = setInterval(() => {
      response.write(': heartbeat\n\n');
    }, 15_000);

    // Auto-close after 5 minutes (safety valve)
    const maxTimeout = setTimeout(() => {
      sendEvent({ stream: 'system', line: 'Stream timeout — closing connection.', ts: Date.now() });
      response.write('event: done\ndata: {}\n\n');
      cleanup();
    }, 5 * 60 * 1000);

    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(maxTimeout);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.quit().catch(() => {});
      response.end();
    };

    // If client disconnects, clean up
    _request.on('close', cleanup);
  }

  /**
   * REST endpoint — returns the stored execution log for a completed test item.
   * GET /workspaces/:workspaceId/runs/:runId/items/:itemId/console/log
   */
  @Get('runs/:runId/items/:itemId/console/log')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getStoredLog(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Param('itemId') itemId: string,
    @Req() request: AppRequest,
  ) {
    const item = await this.prisma.testRunItem.findFirst({
      where: { id: itemId, testRunId: runId, testRun: { workspaceId } },
      select: { id: true, status: true },
    });

    if (!item) {
      throw notFound('RUN_ITEM_NOT_FOUND', 'Test run item was not found.');
    }

    // Find the LOG artifact for this run item
    const logArtifact = await this.prisma.artifact.findFirst({
      where: {
        testRunItemId: itemId,
        testRunId: runId,
        workspaceId,
        artifactType: 'LOG',
      },
      select: { storageKey: true, fileName: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!logArtifact) {
      return success(
        { log: null, status: item.status },
        { requestId: request.requestId },
      );
    }

    const logText = await readStoredText({
      config: getStorageConfig(),
      key: logArtifact.storageKey,
    });

    return success(
      { log: logText, fileName: logArtifact.fileName, status: item.status },
      { requestId: request.requestId },
    );
  }
}
