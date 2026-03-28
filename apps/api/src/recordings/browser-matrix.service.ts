import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { BrowserType, DeviceProfile, RunStatus } from '@prisma/client';
import { notFound } from '../common/http-errors';

export interface BrowserVariant {
  browserType: BrowserType;
  device: DeviceProfile;
  viewportWidth: number;
  viewportHeight: number;
}

export const DEVICE_VIEWPORTS: Record<DeviceProfile, { width: number; height: number }> = {
  DESKTOP: { width: 1920, height: 1080 },
  TABLET: { width: 768, height: 1024 },
  MOBILE: { width: 375, height: 812 },
};

export const DEFAULT_MATRIX: BrowserVariant[] = [
  { browserType: 'CHROMIUM', device: 'DESKTOP', viewportWidth: 1920, viewportHeight: 1080 },
];

@Injectable()
export class BrowserMatrixService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Expand a matrix configuration into browser variants.
   */
  expandMatrix(
    browsers: BrowserType[],
    devices: DeviceProfile[],
  ): BrowserVariant[] {
    const variants: BrowserVariant[] = [];
    for (const browserType of browsers) {
      for (const device of devices) {
        const vp = DEVICE_VIEWPORTS[device] ?? { width: 1920, height: 1080 };
        variants.push({
          browserType,
          device,
          viewportWidth: vp.width,
          viewportHeight: vp.height,
        });
      }
    }
    return variants;
  }

  /**
   * Create browser result records for a run item.
   */
  async createBrowserResults(testRunItemId: string, variants: BrowserVariant[]) {
    const data = variants.map((v) => ({
      testRunItemId,
      browserType: v.browserType,
      device: v.device,
      viewportWidth: v.viewportWidth,
      viewportHeight: v.viewportHeight,
      status: 'QUEUED' as RunStatus,
    }));

    await this.prisma.testRunBrowserResult.createMany({ data });

    return this.prisma.testRunBrowserResult.findMany({
      where: { testRunItemId },
      orderBy: [{ browserType: 'asc' }, { device: 'asc' }],
    });
  }

  /**
   * Update the status of a specific browser result.
   */
  async updateBrowserResult(
    resultId: string,
    update: { status: RunStatus; failureSummary?: string; durationMs?: number },
  ) {
    return this.prisma.testRunBrowserResult.update({
      where: { id: resultId },
      data: {
        status: update.status,
        failureSummary: update.failureSummary,
        durationMs: update.durationMs,
        startedAt: update.status === 'RUNNING' ? new Date() : undefined,
        finishedAt: ['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELED'].includes(update.status)
          ? new Date()
          : undefined,
      },
    });
  }

  /**
   * Get browser matrix results for a specific run item.
   */
  async getItemBrowserResults(testRunItemId: string) {
    return this.prisma.testRunBrowserResult.findMany({
      where: { testRunItemId },
      orderBy: [{ browserType: 'asc' }, { device: 'asc' }],
    });
  }

  /**
   * Get the full browser matrix for a run — tests × browsers.
   */
  async getRunBrowserMatrix(testRunId: string) {
    const items = await this.prisma.testRunItem.findMany({
      where: { testRunId },
      include: {
        canonicalTest: { select: { id: true, name: true } },
        browserResults: {
          orderBy: [{ browserType: 'asc' as const }, { device: 'asc' as const }],
        },
      },
      orderBy: { sequence: 'asc' },
    });

    // Collect unique browser/device combos across all items
    const columns = new Map<string, { browserType: string; device: string }>();
    for (const item of items) {
      for (const br of item.browserResults) {
        const key = `${br.browserType}:${br.device}`;
        if (!columns.has(key)) {
          columns.set(key, { browserType: br.browserType, device: br.device });
        }
      }
    }

    return {
      columns: [...columns.values()],
      rows: items.map((item) => ({
        testRunItemId: item.id,
        sequence: item.sequence,
        testId: item.canonicalTest.id,
        testName: item.canonicalTest.name,
        results: item.browserResults.map((br: { id: string; browserType: string; device: string; viewportWidth: number; viewportHeight: number; status: string; failureSummary: string | null; durationMs: number | null }) => ({
          id: br.id,
          browserType: br.browserType,
          device: br.device,
          viewportWidth: br.viewportWidth,
          viewportHeight: br.viewportHeight,
          status: br.status,
          failureSummary: br.failureSummary,
          durationMs: br.durationMs,
        })),
      })),
    };
  }
}
