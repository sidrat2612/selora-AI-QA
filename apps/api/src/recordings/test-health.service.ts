import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TestHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealthReport(workspaceId: string, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // 1. Per-test aggregation: pass/fail counts, latest status, repair attempts
    const testRunItems = await this.prisma.testRunItem.findMany({
      where: {
        testRun: { workspaceId },
        startedAt: { gte: since },
        status: { in: ['PASSED', 'FAILED', 'TIMED_OUT'] },
      },
      select: {
        canonicalTestId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        retryCount: true,
        failureSummary: true,
        canonicalTest: {
          select: {
            id: true,
            name: true,
            status: true,
            suiteId: true,
            suite: { select: { name: true } },
          },
        },
      },
    });

    // 2. Recent repair attempts
    const repairAttempts = await this.prisma.aIRepairAttempt.findMany({
      where: {
        canonicalTest: { workspaceId },
        startedAt: { gte: since },
      },
      select: {
        canonicalTestId: true,
        status: true,
        repairMode: true,
      },
    });

    // Group by test
    const testMap = new Map<
      string,
      {
        testId: string;
        testName: string;
        testStatus: string;
        suiteId: string | null;
        suiteName: string | null;
        passed: number;
        failed: number;
        timedOut: number;
        totalDurationMs: number;
        runCount: number;
        retryTotal: number;
        repairAttempts: number;
        repairSuccesses: number;
        lastFailureSummary: string | null;
        lastRunAt: Date | null;
      }
    >();

    for (const item of testRunItems) {
      if (!item.canonicalTestId || !item.canonicalTest) continue;
      let entry = testMap.get(item.canonicalTestId);
      if (!entry) {
        entry = {
          testId: item.canonicalTestId,
          testName: item.canonicalTest.name,
          testStatus: item.canonicalTest.status,
          suiteId: item.canonicalTest.suiteId,
          suiteName: item.canonicalTest.suite?.name ?? null,
          passed: 0,
          failed: 0,
          timedOut: 0,
          totalDurationMs: 0,
          runCount: 0,
          retryTotal: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          lastFailureSummary: null,
          lastRunAt: null,
        };
        testMap.set(item.canonicalTestId, entry);
      }

      if (item.status === 'PASSED') entry.passed++;
      else if (item.status === 'FAILED') {
        entry.failed++;
        entry.lastFailureSummary = item.failureSummary ?? entry.lastFailureSummary;
      } else if (item.status === 'TIMED_OUT') entry.timedOut++;

      entry.runCount++;
      entry.retryTotal += item.retryCount;

      if (item.startedAt && item.finishedAt) {
        entry.totalDurationMs +=
          new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime();
      }

      if (!entry.lastRunAt || (item.startedAt && new Date(item.startedAt) > entry.lastRunAt)) {
        entry.lastRunAt = item.startedAt ? new Date(item.startedAt) : null;
      }
    }

    // Enrich with repair data
    for (const repair of repairAttempts) {
      if (!repair.canonicalTestId) continue;
      const entry = testMap.get(repair.canonicalTestId);
      if (!entry) continue;
      entry.repairAttempts++;
      if (repair.status === 'RERUN_PASSED' || repair.status === 'APPLIED') {
        entry.repairSuccesses++;
      }
    }

    // Score each test
    const tests = Array.from(testMap.values()).map((t) => {
      const passRate = t.runCount > 0 ? t.passed / t.runCount : 0;
      const avgDurationMs = t.runCount > 0 ? Math.round(t.totalDurationMs / t.runCount) : 0;
      const repairRate =
        t.repairAttempts > 0 ? t.repairSuccesses / t.repairAttempts : null;

      // Health score: 0-100
      let healthScore = passRate * 70; // pass rate weight: 70
      if (t.timedOut > 0) healthScore -= t.timedOut * 5;
      if (t.retryTotal > 0) healthScore -= Math.min(t.retryTotal, 10);
      if (repairRate !== null) healthScore += repairRate * 20;
      else healthScore += 10; // no repairs needed = decent
      healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

      // Recommendation
      let recommendation: string;
      if (passRate >= 0.95 && t.timedOut === 0)
        recommendation = 'healthy';
      else if (passRate >= 0.8)
        recommendation = 'monitor';
      else if (t.repairAttempts > 0 && repairRate !== null && repairRate < 0.5)
        recommendation = 'needs_rewrite';
      else if (passRate < 0.5)
        recommendation = 'critical';
      else recommendation = 'investigate';

      return {
        testId: t.testId,
        testName: t.testName,
        testStatus: t.testStatus,
        suiteId: t.suiteId,
        suiteName: t.suiteName,
        passed: t.passed,
        failed: t.failed,
        timedOut: t.timedOut,
        runCount: t.runCount,
        passRate: Math.round(passRate * 1000) / 10,
        avgDurationMs,
        repairAttempts: t.repairAttempts,
        repairSuccesses: t.repairSuccesses,
        healthScore,
        recommendation,
        lastFailureSummary: t.lastFailureSummary,
        lastRunAt: t.lastRunAt?.toISOString() ?? null,
      };
    });

    tests.sort((a, b) => a.healthScore - b.healthScore); // worst first

    // Aggregates
    const totalTests = tests.length;
    const healthyCount = tests.filter((t) => t.recommendation === 'healthy').length;
    const criticalCount = tests.filter(
      (t) => t.recommendation === 'critical' || t.recommendation === 'needs_rewrite',
    ).length;
    const avgPassRate =
      totalTests > 0
        ? Math.round(
            (tests.reduce((sum, t) => sum + t.passRate, 0) / totalTests) * 10,
          ) / 10
        : 0;
    const totalRepairs = tests.reduce((sum, t) => sum + t.repairAttempts, 0);
    const totalRepairSuccesses = tests.reduce((sum, t) => sum + t.repairSuccesses, 0);

    return {
      days,
      totalTests,
      healthyCount,
      criticalCount,
      avgPassRate,
      totalRepairs,
      repairSuccessRate:
        totalRepairs > 0
          ? Math.round((totalRepairSuccesses / totalRepairs) * 1000) / 10
          : null,
      tests,
    };
  }

  /**
   * Return daily pass-rate trend data points for each test over the given period.
   * Output: array of { testId, points: [{ date, passRate, runCount }] }
   */
  async getHealthTrend(workspaceId: string, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const items = await this.prisma.testRunItem.findMany({
      where: {
        testRun: { workspaceId },
        startedAt: { gte: since },
        status: { in: ['PASSED', 'FAILED', 'TIMED_OUT'] },
      },
      select: {
        canonicalTestId: true,
        status: true,
        startedAt: true,
      },
    });

    // Group by testId → date → pass/total
    const map = new Map<string, Map<string, { passed: number; total: number }>>();

    for (const item of items) {
      if (!item.canonicalTestId || !item.startedAt) continue;
      const dateKey = item.startedAt.toISOString().slice(0, 10);

      let testMap = map.get(item.canonicalTestId);
      if (!testMap) {
        testMap = new Map();
        map.set(item.canonicalTestId, testMap);
      }

      let bucket = testMap.get(dateKey);
      if (!bucket) {
        bucket = { passed: 0, total: 0 };
        testMap.set(dateKey, bucket);
      }

      bucket.total++;
      if (item.status === 'PASSED') bucket.passed++;
    }

    const trends = Array.from(map.entries()).map(([testId, dateMap]) => ({
      testId,
      points: Array.from(dateMap.entries())
        .map(([date, { passed, total }]) => ({
          date,
          passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
          runCount: total,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));

    return { days, trends };
  }
}
