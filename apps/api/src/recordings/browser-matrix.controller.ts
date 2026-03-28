import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { BrowserType, DeviceProfile } from '@prisma/client';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { BrowserMatrixService } from './browser-matrix.service';

@Controller('workspaces/:workspaceId/browser-matrix')
export class BrowserMatrixController {
  constructor(
    private readonly browserMatrixService: BrowserMatrixService,
  ) {}

  /**
   * POST /workspaces/:id/browser-matrix/expand
   * Preview what a matrix configuration expands to.
   */
  @Post('expand')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async expandMatrix(
    @Body() body: { browsers: BrowserType[]; devices: DeviceProfile[] },
    @Req() request: AppRequest,
  ) {
    const variants = this.browserMatrixService.expandMatrix(body.browsers, body.devices);
    return success(variants, { requestId: request.requestId });
  }

  /**
   * GET /workspaces/:id/browser-matrix/runs/:runId
   * Get the full browser matrix for a run (tests × browsers grid).
   */
  @Get('runs/:runId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getRunMatrix(
    @Param('runId') runId: string,
    @Req() request: AppRequest,
  ) {
    const matrix = await this.browserMatrixService.getRunBrowserMatrix(runId);
    return success(matrix, { requestId: request.requestId });
  }

  /**
   * GET /workspaces/:id/browser-matrix/items/:itemId
   * Get browser results for a specific run item.
   */
  @Get('items/:itemId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getItemResults(
    @Param('itemId') itemId: string,
    @Req() request: AppRequest,
  ) {
    const results = await this.browserMatrixService.getItemBrowserResults(itemId);
    return success(results, { requestId: request.requestId });
  }

  /**
   * POST /workspaces/:id/browser-matrix/items/:itemId/create
   * Create browser variant results for a run item (typically called during run setup).
   */
  @Post('items/:itemId/create')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async createItemBrowserResults(
    @Param('itemId') itemId: string,
    @Body() body: { browsers: BrowserType[]; devices: DeviceProfile[] },
    @Req() request: AppRequest,
  ) {
    const variants = this.browserMatrixService.expandMatrix(body.browsers, body.devices);
    const results = await this.browserMatrixService.createBrowserResults(itemId, variants);
    return success(results, { requestId: request.requestId });
  }
}
