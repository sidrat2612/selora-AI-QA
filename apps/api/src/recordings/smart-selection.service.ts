import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { badRequest, notFound } from '../common/http-errors';

export interface GitDiffInput {
  repoOwner: string;
  repoName: string;
  baseSha: string;
  headSha: string;
  pullRequestNumber?: number;
  changedFiles: string[];
}

export interface SelectionResult {
  selectedTestIds: string[];
  randomSampleIds: string[];
  totalTests: number;
  selectedCount: number;
  randomSampleCount: number;
  coverageConfidence: number;
  mappedFiles: { file: string; testIds: string[] }[];
}

@Injectable()
export class SmartSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyse changed files and select affected tests.
   * Returns a list of test IDs that should be run + a random safety sample.
   */
  async selectTests(
    workspaceId: string,
    suiteId: string | undefined,
    input: GitDiffInput,
  ): Promise<SelectionResult> {
    if (!input.changedFiles.length) {
      throw badRequest('EMPTY_CHANGED_FILES', 'changedFiles must not be empty.');
    }

    // 1. Fetch all test-file mappings for this workspace
    const where: Record<string, unknown> = { workspaceId };
    if (suiteId) {
      where['canonicalTest'] = { suiteId };
    }

    const mappings = await this.prisma.testFileMapping.findMany({
      where,
      select: {
        canonicalTestId: true,
        filePattern: true,
        routePattern: true,
        confidence: true,
      },
    });

    // 2. Match changed files against patterns
    const matchedTestIds = new Set<string>();
    const mappedFiles: { file: string; testIds: string[] }[] = [];

    for (const changedFile of input.changedFiles) {
      const matchingTestIds: string[] = [];
      for (const mapping of mappings) {
        if (fileMatchesPattern(changedFile, mapping.filePattern)) {
          matchingTestIds.push(mapping.canonicalTestId);
          matchedTestIds.add(mapping.canonicalTestId);
        }
      }
      if (matchingTestIds.length > 0) {
        mappedFiles.push({ file: changedFile, testIds: matchingTestIds });
      }
    }

    // 3. Get total eligible tests count
    const allTestsWhere: Record<string, unknown> = {
      workspaceId,
      status: { in: ['GENERATED', 'VALIDATED', 'AUTO_REPAIRED'] },
    };
    if (suiteId) allTestsWhere['suiteId'] = suiteId;

    const totalTests = await this.prisma.canonicalTest.count({ where: allTestsWhere });

    // 4. Add 10% random safety sample from unselected tests
    const selectedArray = [...matchedTestIds];
    const unselectedTests = await this.prisma.canonicalTest.findMany({
      where: {
        ...allTestsWhere,
        id: { notIn: selectedArray },
      },
      select: { id: true },
    });

    const sampleSize = Math.max(1, Math.ceil(totalTests * 0.1));
    const randomSample = shuffleAndTake(
      unselectedTests.map((t) => t.id),
      sampleSize,
    );

    // 5. Compute coverage confidence
    const coverageConfidence =
      totalTests > 0
        ? Math.min(1.0, (selectedArray.length + randomSample.length) / totalTests + (mappings.length > 0 ? 0.1 : 0))
        : 0;

    return {
      selectedTestIds: selectedArray,
      randomSampleIds: randomSample,
      totalTests,
      selectedCount: selectedArray.length,
      randomSampleCount: randomSample.length,
      coverageConfidence: Math.round(coverageConfidence * 100) / 100,
      mappedFiles,
    };
  }

  /**
   * Record a smart selection run for a test run.
   */
  async recordSelectionRun(
    workspaceId: string,
    testRunId: string,
    input: GitDiffInput,
    result: SelectionResult,
  ) {
    return this.prisma.smartSelectionRun.create({
      data: {
        workspaceId,
        testRunId,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        baseSha: input.baseSha,
        headSha: input.headSha,
        pullRequestNumber: input.pullRequestNumber,
        changedFilesJson: input.changedFiles,
        totalTests: result.totalTests,
        selectedTests: result.selectedCount,
        randomSampleTests: result.randomSampleCount,
        coverageConfidence: result.coverageConfidence,
      },
    });
  }

  /**
   * Get the smart selection metadata for a run.
   */
  async getSelectionForRun(testRunId: string) {
    return this.prisma.smartSelectionRun.findUnique({
      where: { testRunId },
    });
  }

  // ─── File Mappings CRUD ─────────────────────────────────────

  async listMappings(workspaceId: string, testId?: string) {
    return this.prisma.testFileMapping.findMany({
      where: {
        workspaceId,
        ...(testId ? { canonicalTestId: testId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertMapping(
    workspaceId: string,
    testId: string,
    filePattern: string,
    opts: { routePattern?: string; confidence?: number; learnedFrom?: string },
  ) {
    const test = await this.prisma.canonicalTest.findFirst({
      where: { id: testId, workspaceId },
    });
    if (!test) throw notFound('TEST_NOT_FOUND', 'Test not found.');

    return this.prisma.testFileMapping.upsert({
      where: { canonicalTestId_filePattern: { canonicalTestId: testId, filePattern } },
      update: {
        routePattern: opts.routePattern,
        confidence: opts.confidence ?? 1.0,
        learnedFrom: opts.learnedFrom ?? 'manual',
      },
      create: {
        workspaceId,
        canonicalTestId: testId,
        filePattern,
        routePattern: opts.routePattern,
        confidence: opts.confidence ?? 1.0,
        learnedFrom: opts.learnedFrom ?? 'manual',
      },
    });
  }

  async deleteMapping(workspaceId: string, mappingId: string) {
    const mapping = await this.prisma.testFileMapping.findFirst({
      where: { id: mappingId, workspaceId },
    });
    if (!mapping) throw notFound('MAPPING_NOT_FOUND', 'Mapping not found.');

    await this.prisma.testFileMapping.delete({ where: { id: mappingId } });
    return { deleted: true };
  }

  /**
   * Learn file → test mappings from execution trace URLs.
   * Called after a run completes to build the dependency map.
   */
  async learnFromExecution(
    workspaceId: string,
    testId: string,
    visitedUrls: string[],
  ) {
    const patterns: string[] = [];
    for (const url of visitedUrls) {
      try {
        const parsed = new URL(url);
        // Extract path as a route pattern
        const route = parsed.pathname.replace(/\/[0-9a-f-]{36}/g, '/:id');
        if (route && route !== '/') {
          patterns.push(route);
        }
      } catch {
        // skip invalid URLs
      }
    }

    const uniquePatterns = [...new Set(patterns)];
    for (const route of uniquePatterns) {
      await this.prisma.testFileMapping.upsert({
        where: { canonicalTestId_filePattern: { canonicalTestId: testId, filePattern: route } },
        update: { routePattern: route, learnedFrom: 'execution_trace', confidence: 0.8 },
        create: {
          workspaceId,
          canonicalTestId: testId,
          filePattern: route,
          routePattern: route,
          learnedFrom: 'execution_trace',
          confidence: 0.8,
        },
      });
    }

    return { learnedPatterns: uniquePatterns.length };
  }
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Matches a file path against a glob-like pattern.
 * Supports: * (any segment), ** (any depth), exact match.
 */
function fileMatchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '⟨DOUBLE⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨DOUBLE⟩/g, '.*');
  try {
    return new RegExp(`^${regexStr}$`).test(filePath);
  } catch {
    return filePath.includes(pattern);
  }
}

function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i]!, copy[j]!] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}
