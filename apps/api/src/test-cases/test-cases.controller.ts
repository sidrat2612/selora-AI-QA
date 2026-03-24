import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembershipRole } from '@prisma/client';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { TestCasesService } from './test-cases.service';

type UploadedCsvFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('workspaces/:workspaceId/suites/:suiteId')
export class TestCasesController {
  constructor(private readonly testCasesService: TestCasesService) {}

  // ─── Business Test Cases ────────────────────────────────────────────────────

  @Get('test-cases')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listTestCases(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.testCasesService.listTestCases(workspaceId, suiteId), {
      requestId: request.requestId,
    });
  }

  @Get('test-cases/:testCaseId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async getTestCase(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.testCasesService.getTestCase(workspaceId, suiteId, testCaseId), {
      requestId: request.requestId,
    });
  }

  @Post('test-cases')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async createTestCase(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testCasesService.createTestCase(
        workspaceId,
        suiteId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Post('test-cases/import/csv')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async importCsv(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @UploadedFile() file: UploadedCsvFile | undefined,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('CSV file is required.');
    }

    return success(
      await this.testCasesService.importCsv(
        workspaceId,
        suiteId,
        file.buffer,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Patch('test-cases/:testCaseId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async updateTestCase(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testCasesService.updateTestCase(
        workspaceId,
        suiteId,
        testCaseId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('test-cases/:testCaseId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async deleteTestCase(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testCasesService.deleteTestCase(
        workspaceId,
        suiteId,
        testCaseId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  // ─── Script Mappings ───────────────────────────────────────────────────────

  @Get('test-cases/:testCaseId/mappings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listMappings(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @Req() request: AppRequest,
  ) {
    return success(await this.testCasesService.listMappings(workspaceId, suiteId, testCaseId), {
      requestId: request.requestId,
    });
  }

  @Post('test-cases/:testCaseId/mappings')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async addScriptMapping(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testCasesService.addScriptMapping(
        workspaceId,
        suiteId,
        testCaseId,
        body,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }

  @Delete('test-cases/:testCaseId/mappings/:mappingId')
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard, RolesGuard)
  @RequireRoles(
    MembershipRole.PLATFORM_ADMIN,
    MembershipRole.TENANT_ADMIN,
    MembershipRole.TENANT_OPERATOR,
  )
  async removeScriptMapping(
    @Param('workspaceId') workspaceId: string,
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @Param('mappingId') mappingId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    return success(
      await this.testCasesService.removeScriptMapping(
        workspaceId,
        suiteId,
        testCaseId,
        mappingId,
        auth,
        request.resourceTenantId as string,
        request.requestId,
      ),
      { requestId: request.requestId },
    );
  }
}
