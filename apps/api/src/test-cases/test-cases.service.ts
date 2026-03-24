import { Injectable } from '@nestjs/common';
import {
  BusinessTestCaseFormat,
  BusinessTestCasePriority,
  BusinessTestCaseSource,
  BusinessTestCaseStatus,
  type Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { badRequest, notFound } from '../common/http-errors';
import type { RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';

const testCaseSummarySelect = {
  id: true,
  workspaceId: true,
  suiteId: true,
  title: true,
  description: true,
  format: true,
  source: true,
  status: true,
  priority: true,
  tagsJson: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      scriptMappings: true,
    },
  },
} as const;

@Injectable()
export class TestCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── List Business Test Cases ──────────────────────────────────────────────

  async listTestCases(workspaceId: string, suiteId: string) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      select: { id: true },
    });

    if (!suite) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }

    const testCases = await this.prisma.businessTestCase.findMany({
      where: { suiteId, workspaceId, status: { not: 'ARCHIVED' } },
      select: {
        ...testCaseSummarySelect,
        scriptMappings: {
          select: {
            id: true,
            canonicalTestId: true,
            canonicalTest: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    return testCases.map((tc) => ({
      id: tc.id,
      workspaceId: tc.workspaceId,
      suiteId: tc.suiteId,
      title: tc.title,
      description: tc.description,
      format: tc.format,
      source: tc.source,
      status: tc.status,
      priority: tc.priority,
      tags: tc.tagsJson,
      createdAt: tc.createdAt,
      updatedAt: tc.updatedAt,
      mappedScriptCount: tc._count.scriptMappings,
      mappedScripts: tc.scriptMappings.map((m) => ({
        mappingId: m.id,
        canonicalTestId: m.canonicalTestId,
        name: m.canonicalTest.name,
        status: m.canonicalTest.status,
      })),
    }));
  }

  // ─── Get Single Test Case ─────────────────────────────────────────────────

  async getTestCase(workspaceId: string, suiteId: string, testCaseId: string) {
    const testCase = await this.prisma.businessTestCase.findFirst({
      where: { id: testCaseId, suiteId, workspaceId },
      include: {
        scriptMappings: {
          select: {
            id: true,
            canonicalTestId: true,
            canonicalTest: {
              select: {
                id: true,
                name: true,
                status: true,
                updatedAt: true,
              },
            },
          },
        },
        externalCaseLinks: {
          select: {
            id: true,
            externalCaseId: true,
            status: true,
            ownerEmail: true,
            titleSnapshot: true,
            sectionNameSnapshot: true,
            lastSyncedAt: true,
            lastError: true,
            retryEligible: true,
          },
        },
        _count: {
          select: {
            testCaseResults: true,
            scriptMappings: true,
          },
        },
      },
    });

    if (!testCase) {
      throw notFound('TEST_CASE_NOT_FOUND', 'Business test case was not found.');
    }

    return {
      id: testCase.id,
      workspaceId: testCase.workspaceId,
      suiteId: testCase.suiteId,
      title: testCase.title,
      description: testCase.description,
      format: testCase.format,
      source: testCase.source,
      status: testCase.status,
      priority: testCase.priority,
      preconditions: testCase.preconditions,
      steps: testCase.stepsJson,
      expectedResult: testCase.expectedResult,
      tags: testCase.tagsJson,
      createdAt: testCase.createdAt,
      updatedAt: testCase.updatedAt,
      mappedScriptCount: testCase._count.scriptMappings,
      totalResults: testCase._count.testCaseResults,
      mappedScripts: testCase.scriptMappings.map((m) => ({
        mappingId: m.id,
        canonicalTestId: m.canonicalTestId,
        name: m.canonicalTest.name,
        status: m.canonicalTest.status,
        updatedAt: m.canonicalTest.updatedAt,
      })),
      externalLinks: testCase.externalCaseLinks.map((link) => ({
        id: link.id,
        externalCaseId: link.externalCaseId,
        status: link.status,
        ownerEmail: link.ownerEmail,
        title: link.titleSnapshot,
        section: link.sectionNameSnapshot,
        lastSyncedAt: link.lastSyncedAt,
        lastError: link.lastError,
        retryEligible: link.retryEligible,
      })),
    };
  }

  // ─── Create Business Test Case ─────────────────────────────────────────────

  async createTestCase(
    workspaceId: string,
    suiteId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      select: { id: true },
    });

    if (!suite) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }

    const { title, description, format, priority, preconditions, steps, expectedResult, tags } =
      this.readTestCaseBody(body);

    const testCase = await this.prisma.businessTestCase.create({
      data: {
        workspaceId,
        suiteId,
        title,
        description,
        format,
        source: BusinessTestCaseSource.MANUAL,
        status: BusinessTestCaseStatus.ACTIVE,
        priority,
        preconditions,
        stepsJson: steps ?? undefined,
        expectedResult,
        tagsJson: tags ?? [],
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'business_test_case.created',
      entityType: 'business_test_case',
      entityId: testCase.id,
      requestId,
      metadataJson: { suiteId, title, format, source: 'MANUAL' },
    });

    return testCase;
  }

  // ─── Update Business Test Case ─────────────────────────────────────────────

  async updateTestCase(
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const testCase = await this.prisma.businessTestCase.findFirst({
      where: { id: testCaseId, suiteId, workspaceId },
      select: { id: true },
    });

    if (!testCase) {
      throw notFound('TEST_CASE_NOT_FOUND', 'Business test case was not found.');
    }

    const data: Prisma.BusinessTestCaseUpdateInput = {};

    if (typeof body['title'] === 'string') {
      const title = body['title'].trim();
      if (!title) throw badRequest('VALIDATION_ERROR', 'Title must not be empty.');
      data.title = title;
    }
    if (body['description'] !== undefined) {
      data.description = typeof body['description'] === 'string' ? body['description'].trim() || null : null;
    }
    if (body['format'] !== undefined) {
      data.format = this.readFormat(body['format']);
    }
    if (body['priority'] !== undefined) {
      data.priority = this.readPriority(body['priority']);
    }
    if (body['preconditions'] !== undefined) {
      data.preconditions = typeof body['preconditions'] === 'string' ? body['preconditions'].trim() || null : null;
    }
    if (body['steps'] !== undefined) {
      data.stepsJson = Array.isArray(body['steps']) ? body['steps'] : undefined;
    }
    if (body['expectedResult'] !== undefined) {
      data.expectedResult = typeof body['expectedResult'] === 'string' ? body['expectedResult'].trim() || null : null;
    }
    if (body['tags'] !== undefined) {
      data.tagsJson = this.readTags(body['tags']);
    }
    if (body['status'] !== undefined) {
      data.status = this.readStatus(body['status']);
    }

    const updated = await this.prisma.businessTestCase.update({
      where: { id: testCaseId },
      data,
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'business_test_case.updated',
      entityType: 'business_test_case',
      entityId: testCaseId,
      requestId,
      metadataJson: { suiteId, fields: Object.keys(data) },
    });

    return updated;
  }

  // ─── Delete (Archive) Business Test Case ───────────────────────────────────

  async deleteTestCase(
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const testCase = await this.prisma.businessTestCase.findFirst({
      where: { id: testCaseId, suiteId, workspaceId },
      select: { id: true },
    });

    if (!testCase) {
      throw notFound('TEST_CASE_NOT_FOUND', 'Business test case was not found.');
    }

    const archived = await this.prisma.businessTestCase.update({
      where: { id: testCaseId },
      data: { status: BusinessTestCaseStatus.ARCHIVED },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'business_test_case.archived',
      entityType: 'business_test_case',
      entityId: testCaseId,
      requestId,
      metadataJson: { suiteId },
    });

    return archived;
  }

  // ─── CSV Import ────────────────────────────────────────────────────────────

  async importCsv(
    workspaceId: string,
    suiteId: string,
    csvBuffer: Buffer,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const suite = await this.prisma.automationSuite.findFirst({
      where: { id: suiteId, workspaceId },
      select: { id: true },
    });

    if (!suite) {
      throw notFound('SUITE_NOT_FOUND', 'Suite was not found.');
    }

    const rows = this.parseCsv(csvBuffer);
    if (rows.length === 0) {
      throw badRequest('CSV_EMPTY', 'CSV file contains no data rows.');
    }
    if (rows.length > 500) {
      throw badRequest('CSV_TOO_LARGE', 'CSV import is limited to 500 rows.');
    }

    const created = await this.prisma.businessTestCase.createMany({
      data: rows.map((row) => ({
        workspaceId,
        suiteId,
        title: row.title,
        description: row.description,
        format: row.format,
        source: BusinessTestCaseSource.CSV_IMPORT,
        status: BusinessTestCaseStatus.ACTIVE,
        priority: row.priority,
        preconditions: row.preconditions,
        expectedResult: row.expectedResult,
        tagsJson: row.tags,
      })),
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'business_test_case.csv_imported',
      entityType: 'automation_suite',
      entityId: suiteId,
      requestId,
      metadataJson: { importedCount: created.count },
    });

    return { importedCount: created.count };
  }

  private parseCsv(buffer: Buffer) {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headerLine = lines[0]!;
    const headers = this.splitCsvLine(headerLine).map((h) => h.toLowerCase().trim());
    const titleIdx = headers.indexOf('title');
    if (titleIdx < 0) {
      throw badRequest('CSV_INVALID_HEADER', 'CSV must contain a "title" column.');
    }

    const descIdx = headers.indexOf('description');
    const priorityIdx = headers.indexOf('priority');
    const preconditionsIdx = headers.indexOf('preconditions');
    const expectedResultIdx = headers.indexOf('expectedresult');
    const tagsIdx = headers.indexOf('tags');

    const results: Array<{
      title: string;
      description: string | null;
      format: BusinessTestCaseFormat;
      priority: BusinessTestCasePriority;
      preconditions: string | null;
      expectedResult: string | null;
      tags: string[];
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const columns = this.splitCsvLine(lines[i]!);
      const title = (columns[titleIdx] ?? '').trim();
      if (!title) continue;

      const rawPriority = priorityIdx >= 0 ? (columns[priorityIdx] ?? '').trim().toUpperCase() : '';
      const priority = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(rawPriority)
        ? rawPriority
        : 'MEDIUM') as BusinessTestCasePriority;

      const tags = tagsIdx >= 0
        ? (columns[tagsIdx] ?? '')
            .split(';')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      results.push({
        title,
        description: descIdx >= 0 ? (columns[descIdx] ?? '').trim() || null : null,
        format: BusinessTestCaseFormat.SIMPLE,
        priority,
        preconditions: preconditionsIdx >= 0 ? (columns[preconditionsIdx] ?? '').trim() || null : null,
        expectedResult: expectedResultIdx >= 0 ? (columns[expectedResultIdx] ?? '').trim() || null : null,
        tags,
      });
    }

    return results;
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current);
    return result;
  }

  // ─── Script Mapping CRUD ───────────────────────────────────────────────────

  async addScriptMapping(
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const canonicalTestId = typeof body['canonicalTestId'] === 'string' ? body['canonicalTestId'].trim() : '';
    if (!canonicalTestId) {
      throw badRequest('VALIDATION_ERROR', 'canonicalTestId is required.');
    }

    const [testCase, canonicalTest] = await Promise.all([
      this.prisma.businessTestCase.findFirst({
        where: { id: testCaseId, suiteId, workspaceId },
        select: { id: true },
      }),
      this.prisma.canonicalTest.findFirst({
        where: { id: canonicalTestId, workspaceId },
        select: { id: true, name: true },
      }),
    ]);

    if (!testCase) {
      throw notFound('TEST_CASE_NOT_FOUND', 'Business test case was not found.');
    }
    if (!canonicalTest) {
      throw notFound('CANONICAL_TEST_NOT_FOUND', 'Automation script was not found in this workspace.');
    }

    const existing = await this.prisma.testCaseScriptMapping.findUnique({
      where: {
        businessTestCaseId_canonicalTestId: {
          businessTestCaseId: testCaseId,
          canonicalTestId,
        },
      },
    });

    if (existing) {
      throw badRequest('MAPPING_ALREADY_EXISTS', 'This script is already mapped to this test case.');
    }

    const mapping = await this.prisma.testCaseScriptMapping.create({
      data: {
        businessTestCaseId: testCaseId,
        canonicalTestId,
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'test_case_mapping.created',
      entityType: 'test_case_script_mapping',
      entityId: mapping.id,
      requestId,
      metadataJson: { businessTestCaseId: testCaseId, canonicalTestId, scriptName: canonicalTest.name },
    });

    return {
      id: mapping.id,
      businessTestCaseId: mapping.businessTestCaseId,
      canonicalTestId: mapping.canonicalTestId,
      scriptName: canonicalTest.name,
      createdAt: mapping.createdAt,
    };
  }

  async removeScriptMapping(
    workspaceId: string,
    suiteId: string,
    testCaseId: string,
    mappingId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const mapping = await this.prisma.testCaseScriptMapping.findFirst({
      where: {
        id: mappingId,
        businessTestCaseId: testCaseId,
        businessTestCase: { suiteId, workspaceId },
      },
      select: { id: true, canonicalTestId: true },
    });

    if (!mapping) {
      throw notFound('MAPPING_NOT_FOUND', 'Script mapping was not found.');
    }

    await this.prisma.testCaseScriptMapping.delete({
      where: { id: mappingId },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'test_case_mapping.deleted',
      entityType: 'test_case_script_mapping',
      entityId: mappingId,
      requestId,
      metadataJson: { businessTestCaseId: testCaseId, canonicalTestId: mapping.canonicalTestId },
    });

    return { deleted: true };
  }

  async listMappings(workspaceId: string, suiteId: string, testCaseId: string) {
    const testCase = await this.prisma.businessTestCase.findFirst({
      where: { id: testCaseId, suiteId, workspaceId },
      select: { id: true },
    });

    if (!testCase) {
      throw notFound('TEST_CASE_NOT_FOUND', 'Business test case was not found.');
    }

    const mappings = await this.prisma.testCaseScriptMapping.findMany({
      where: { businessTestCaseId: testCaseId },
      include: {
        canonicalTest: {
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return mappings.map((m) => ({
      id: m.id,
      businessTestCaseId: m.businessTestCaseId,
      canonicalTestId: m.canonicalTestId,
      scriptName: m.canonicalTest.name,
      scriptStatus: m.canonicalTest.status,
      scriptUpdatedAt: m.canonicalTest.updatedAt,
      createdAt: m.createdAt,
    }));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private readTestCaseBody(body: Record<string, unknown>) {
    const title = typeof body['title'] === 'string' ? body['title'].trim() : '';
    if (!title) {
      throw badRequest('VALIDATION_ERROR', 'title is required.');
    }

    const description = typeof body['description'] === 'string' ? body['description'].trim() || null : null;
    const format = this.readFormat(body['format'] ?? 'SIMPLE');
    const priority = this.readPriority(body['priority'] ?? 'MEDIUM');
    const preconditions = typeof body['preconditions'] === 'string' ? body['preconditions'].trim() || null : null;
    const steps = Array.isArray(body['steps']) ? body['steps'] : null;
    const expectedResult = typeof body['expectedResult'] === 'string' ? body['expectedResult'].trim() || null : null;
    const tags = this.readTags(body['tags'] ?? []);

    return { title, description, format, priority, preconditions, steps, expectedResult, tags };
  }

  private readFormat(value: unknown): BusinessTestCaseFormat {
    if (value === 'SIMPLE' || value === 'STRUCTURED') {
      return value;
    }
    throw badRequest('INVALID_FORMAT', 'format must be SIMPLE or STRUCTURED.');
  }

  private readPriority(value: unknown): BusinessTestCasePriority {
    if (value === 'CRITICAL' || value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') {
      return value;
    }
    throw badRequest('INVALID_PRIORITY', 'priority must be CRITICAL, HIGH, MEDIUM, or LOW.');
  }

  private readStatus(value: unknown): BusinessTestCaseStatus {
    if (value === 'ACTIVE' || value === 'ARCHIVED') {
      return value;
    }
    throw badRequest('INVALID_STATUS', 'status must be ACTIVE or ARCHIVED.');
  }

  private readTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw badRequest('VALIDATION_ERROR', 'tags must be an array of strings.');
    }
    return [...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    )];
  }
}
