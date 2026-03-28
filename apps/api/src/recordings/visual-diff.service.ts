import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  buildStorageKey,
  getStorageConfig,
  putStoredObject,
  readStoredText,
  STORAGE_CATEGORIES,
} from '@selora/storage';
import { badRequest, notFound } from '../common/http-errors';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  testId: string;
  stepIndex: number;
  status: 'NO_BASELINE' | 'MATCH' | 'MISMATCH';
  baselineStorageKey: string | null;
  currentStorageKey: string | null;
  mismatchPixels: number;
  totalPixels: number;
  diffPercentage: number;
  classification?: 'real_regression' | 'noise' | 'layout_shift' | 'dynamic_content' | null;
  classificationConfidence?: number;
}

@Injectable()
export class VisualDiffService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save or replace a visual baseline for a specific test step.
   */
  async upsertBaseline(
    workspaceId: string,
    testId: string,
    stepIndex: number,
    body: {
      imageBase64: string;
      stepLabel?: string;
      width?: number;
      height?: number;
    },
    userId: string,
    tenantId: string,
  ) {
    // Validate test belongs to workspace
    const test = await this.prisma.canonicalTest.findFirst({
      where: { id: testId, workspaceId },
      select: { id: true },
    });
    if (!test) {
      throw notFound('TEST_NOT_FOUND', 'Test not found in this workspace.');
    }

    if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'imageBase64 is required.');
    }

    const imageBuffer = Buffer.from(body.imageBase64, 'base64');
    const fileName = `baseline-step-${stepIndex}.png`;
    const storageKey = buildStorageKey({
      tenantId,
      workspaceId,
      category: STORAGE_CATEGORIES.ARTIFACTS,
      fileName: `visual-baselines/${testId}/${fileName}`,
    });

    await putStoredObject({
      config: getStorageConfig(),
      key: storageKey,
      body: imageBuffer,
      contentType: 'image/png',
    });

    const baseline = await this.prisma.visualBaseline.upsert({
      where: {
        canonicalTestId_stepIndex: {
          canonicalTestId: testId,
          stepIndex,
        },
      },
      update: {
        storageKey,
        stepLabel: body.stepLabel ?? null,
        width: body.width ?? 0,
        height: body.height ?? 0,
        sizeBytes: imageBuffer.length,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
      create: {
        workspaceId,
        canonicalTestId: testId,
        stepIndex,
        stepLabel: body.stepLabel ?? null,
        storageKey,
        width: body.width ?? 0,
        height: body.height ?? 0,
        sizeBytes: imageBuffer.length,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });

    return {
      id: baseline.id,
      testId: baseline.canonicalTestId,
      stepIndex: baseline.stepIndex,
      stepLabel: baseline.stepLabel,
      storageKey: baseline.storageKey,
      width: baseline.width,
      height: baseline.height,
      approvedAt: baseline.approvedAt?.toISOString() ?? null,
    };
  }

  /**
   * List all baselines for a test.
   */
  async listBaselines(workspaceId: string, testId: string) {
    const baselines = await this.prisma.visualBaseline.findMany({
      where: { workspaceId, canonicalTestId: testId },
      orderBy: { stepIndex: 'asc' },
      select: {
        id: true,
        stepIndex: true,
        stepLabel: true,
        storageKey: true,
        width: true,
        height: true,
        sizeBytes: true,
        approvedAt: true,
        approvedBy: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    return baselines.map((b) => ({
      id: b.id,
      stepIndex: b.stepIndex,
      stepLabel: b.stepLabel,
      storageKey: b.storageKey,
      width: b.width,
      height: b.height,
      sizeBytes: Number(b.sizeBytes),
      approvedAt: b.approvedAt?.toISOString() ?? null,
      approvedBy: b.approvedBy
        ? { id: b.approvedBy.id, name: b.approvedBy.name }
        : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));
  }

  /**
   * Delete a baseline.
   */
  async deleteBaseline(workspaceId: string, baselineId: string) {
    const baseline = await this.prisma.visualBaseline.findFirst({
      where: { id: baselineId, workspaceId },
    });
    if (!baseline) {
      throw notFound('BASELINE_NOT_FOUND', 'Visual baseline not found.');
    }

    await this.prisma.visualBaseline.delete({
      where: { id: baselineId },
    });

    return { deleted: true };
  }

  /**
   * Compare a run's screenshots against baselines for a test.
   * Returns per-step diff results using basic pixel comparison.
   */
  async compareRunScreenshots(
    workspaceId: string,
    testId: string,
    runItemId: string,
    tenantId: string,
  ): Promise<DiffResult[]> {
    // Get baselines for this test
    const baselines = await this.prisma.visualBaseline.findMany({
      where: { canonicalTestId: testId, workspaceId },
      orderBy: { stepIndex: 'asc' },
    });

    // Get screenshot artifacts for this run item
    const screenshots = await this.prisma.artifact.findMany({
      where: {
        testRunItemId: runItemId,
        artifactType: 'SCREENSHOT',
      },
      orderBy: { createdAt: 'asc' },
    });

    const results: DiffResult[] = [];

    for (let i = 0; i < Math.max(baselines.length, screenshots.length); i++) {
      const baseline = baselines[i];
      const screenshot = screenshots[i];

      if (!baseline) {
        results.push({
          testId,
          stepIndex: i,
          status: 'NO_BASELINE',
          baselineStorageKey: null,
          currentStorageKey: screenshot?.storageKey ?? null,
          mismatchPixels: 0,
          totalPixels: 0,
          diffPercentage: 0,
        });
        continue;
      }

      if (!screenshot) {
        results.push({
          testId,
          stepIndex: baseline.stepIndex,
          status: 'MISMATCH',
          baselineStorageKey: baseline.storageKey,
          currentStorageKey: null,
          mismatchPixels: 0,
          totalPixels: 0,
          diffPercentage: 100,
        });
        continue;
      }

      // Pixel-level comparison using pixelmatch
      const diffResult = await this.compareImages(
        baseline.storageKey,
        screenshot.storageKey,
        tenantId,
      );

      const isMismatch = diffResult.mismatchPixels > 0;
      const result: DiffResult = {
        testId,
        stepIndex: baseline.stepIndex,
        status: isMismatch ? 'MISMATCH' : 'MATCH',
        baselineStorageKey: baseline.storageKey,
        currentStorageKey: screenshot.storageKey,
        mismatchPixels: diffResult.mismatchPixels,
        totalPixels: diffResult.totalPixels,
        diffPercentage: diffResult.diffPercentage,
      };

      // Auto-classify mismatches using LLM if available
      if (isMismatch) {
        const classification = await this.classifyDiff(result, baseline.stepLabel);
        result.classification = classification.classification;
        result.classificationConfidence = classification.confidence;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Approve a screenshot from a run as the new baseline.
   */
  async approveScreenshotAsBaseline(
    workspaceId: string,
    testId: string,
    runItemId: string,
    stepIndex: number,
    userId: string,
    tenantId: string,
  ) {
    // Find the screenshot artifact at the given step index
    const screenshots = await this.prisma.artifact.findMany({
      where: {
        testRunItemId: runItemId,
        artifactType: 'SCREENSHOT',
      },
      orderBy: { createdAt: 'asc' },
    });

    const screenshot = screenshots[stepIndex];
    if (!screenshot) {
      throw notFound('SCREENSHOT_NOT_FOUND', `No screenshot at step ${stepIndex}.`);
    }

    // Upsert the baseline with the screenshot's storage key
    const baseline = await this.prisma.visualBaseline.upsert({
      where: {
        canonicalTestId_stepIndex: {
          canonicalTestId: testId,
          stepIndex,
        },
      },
      update: {
        storageKey: screenshot.storageKey,
        sizeBytes: screenshot.sizeBytes,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
      create: {
        workspaceId,
        canonicalTestId: testId,
        stepIndex,
        storageKey: screenshot.storageKey,
        sizeBytes: screenshot.sizeBytes,
        contentType: screenshot.contentType,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });

    return {
      id: baseline.id,
      stepIndex: baseline.stepIndex,
      status: 'APPROVED' as const,
      storageKey: baseline.storageKey,
    };
  }

  /**
   * Use LLM to classify a visual diff as real regression or noise.
   * Sends diff metadata (not images) to the LLM for smart classification.
   */
  async classifyDiff(
    diff: DiffResult,
    stepLabel?: string | null,
  ): Promise<{ classification: DiffResult['classification']; confidence: number }> {
    const apiKey = process.env['AI_PROVIDER_API_KEY'];
    const baseUrl = process.env['AI_PROVIDER_BASE_URL'] ?? 'https://api.openai.com/v1';
    const model = process.env['AI_MODEL'] ?? 'gpt-4o-mini';

    if (!apiKey) {
      return { classification: null, confidence: 0 };
    }

    const prompt = `You are a visual regression testing expert. Classify this visual diff result.

Step: ${stepLabel ?? `Step ${diff.stepIndex}`}
Diff percentage: ${diff.diffPercentage}%
Mismatched pixels: ${diff.mismatchPixels} / ${diff.totalPixels}

Classify as one of:
- "real_regression": Meaningful UI change that needs attention
- "noise": Anti-aliasing, sub-pixel rendering, or compression artifacts
- "layout_shift": Minor layout/position changes (1-5px shifts)
- "dynamic_content": Date/time, ads, or other dynamic content changes

Respond with JSON only: {"classification": "...", "confidence": 0.0-1.0}`;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 100,
        }),
      });

      if (!response.ok) {
        return { classification: null, confidence: 0 };
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (!jsonMatch) return { classification: null, confidence: 0 };

      const parsed = JSON.parse(jsonMatch[0]) as {
        classification?: string;
        confidence?: number;
      };
      const validClassifications = ['real_regression', 'noise', 'layout_shift', 'dynamic_content'];
      if (!parsed.classification || !validClassifications.includes(parsed.classification)) {
        return { classification: null, confidence: 0 };
      }

      return {
        classification: parsed.classification as DiffResult['classification'],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      return { classification: null, confidence: 0 };
    }
  }

  /**
   * Compare two stored PNG images using pixelmatch.
   * Falls back to size-based comparison if PNG decode fails.
   */
  private async compareImages(
    baselineKey: string,
    currentKey: string,
    _tenantId: string,
  ): Promise<{ mismatchPixels: number; totalPixels: number; diffPercentage: number }> {
    try {
      const config = getStorageConfig();
      const [baselineData, currentData] = await Promise.all([
        readStoredText({ config, key: baselineKey }),
        readStoredText({ config, key: currentKey }),
      ]);

      if (!baselineData || !currentData) {
        return { mismatchPixels: 1, totalPixels: 1, diffPercentage: 100 };
      }

      const baselinePng = PNG.sync.read(Buffer.from(baselineData, 'base64'));
      const currentPng = PNG.sync.read(Buffer.from(currentData, 'base64'));

      // Resize to the larger dimensions if they differ
      const width = Math.max(baselinePng.width, currentPng.width);
      const height = Math.max(baselinePng.height, currentPng.height);
      const totalPixels = width * height;

      // If dimensions don't match, report full mismatch for safety
      if (baselinePng.width !== currentPng.width || baselinePng.height !== currentPng.height) {
        return { mismatchPixels: totalPixels, totalPixels, diffPercentage: 100 };
      }

      const diff = new PNG({ width, height });
      const mismatchPixels = pixelmatch(
        baselinePng.data,
        currentPng.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 },
      );

      const diffPercentage =
        totalPixels > 0 ? Math.round((mismatchPixels / totalPixels) * 10000) / 100 : 0;

      return { mismatchPixels, totalPixels, diffPercentage };
    } catch {
      // Fallback: if image decode fails, report mismatch
      return { mismatchPixels: 1, totalPixels: 1, diffPercentage: 100 };
    }
  }
}
