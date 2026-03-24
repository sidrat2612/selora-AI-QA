import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RolloutStage } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Progressive rollout automation.
 *
 * Runs every hour and evaluates suites eligible for automatic promotion
 * through rollout stages: INTERNAL → PILOT → GENERAL.
 *
 * Promotion criteria:
 *  - Suite has been at current stage for at least 72 hours
 *  - Suite has ≥ 3 completed runs during the current stage
 *  - ≥ 80 % pass rate across those runs
 *  - No FAILED runs in the last 24 hours
 *  - Tenant feature flags allow the next stage (maxRolloutStage)
 */
@Injectable()
export class RolloutAutomationService {
  private readonly logger = new Logger(RolloutAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async evaluateRolloutPromotions() {
    this.logger.log('Evaluating progressive rollout promotions...');

    const eligibleSuites = await this.prisma.automationSuite.findMany({
      where: {
        status: 'ACTIVE',
        rolloutStage: { in: [RolloutStage.INTERNAL, RolloutStage.PILOT] },
      },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        name: true,
        rolloutStage: true,
        updatedAt: true,
      },
    });

    let promoted = 0;

    for (const suite of eligibleSuites) {
      try {
        const didPromote = await this.evaluateSuite(suite);
        if (didPromote) promoted++;
      } catch (error) {
        this.logger.warn(`Failed to evaluate suite ${suite.id}: ${error}`);
      }
    }

    this.logger.log(`Rollout evaluation complete. Promoted ${promoted} of ${eligibleSuites.length} eligible suite(s).`);
  }

  private async evaluateSuite(suite: {
    id: string;
    tenantId: string;
    workspaceId: string;
    name: string;
    rolloutStage: RolloutStage;
    updatedAt: Date;
  }): Promise<boolean> {
    const nextStage = this.getNextStage(suite.rolloutStage);
    if (!nextStage) return false;

    // Check tenant allows the target stage
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: suite.tenantId },
      select: { maxRolloutStage: true },
    });

    if (!tenant) return false;

    const stageOrder = [RolloutStage.INTERNAL, RolloutStage.PILOT, RolloutStage.GENERAL];
    const maxIdx = stageOrder.indexOf(tenant.maxRolloutStage);
    const targetIdx = stageOrder.indexOf(nextStage);
    if (targetIdx > maxIdx) return false;

    // Suite must have been at current stage for ≥ 72 hours
    const minStageAge = 72 * 60 * 60 * 1000;
    if (Date.now() - suite.updatedAt.getTime() < minStageAge) return false;

    // Count completed runs during current stage period
    const stageStart = suite.updatedAt;
    const recentRuns = await this.prisma.testRun.findMany({
      where: {
        suiteId: suite.id,
        createdAt: { gte: stageStart },
        status: { in: ['PASSED', 'FAILED'] },
      },
      select: { status: true, passedCount: true, failedCount: true, createdAt: true },
    });

    if (recentRuns.length < 3) return false;

    // ≥ 80% pass rate
    const totalPassed = recentRuns.reduce((sum, r) => sum + r.passedCount, 0);
    const totalFailed = recentRuns.reduce((sum, r) => sum + r.failedCount, 0);
    const total = totalPassed + totalFailed;
    if (total === 0) return false;

    const passRate = totalPassed / total;
    if (passRate < 0.8) return false;

    // No FAILED runs in last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentFailures = recentRuns.filter(
      (r) => r.status === 'FAILED' && r.createdAt >= last24h,
    );
    if (recentFailures.length > 0) return false;

    // Promote
    await this.prisma.automationSuite.update({
      where: { id: suite.id },
      data: { rolloutStage: nextStage },
    });

    await this.auditService.record({
      tenantId: suite.tenantId,
      workspaceId: suite.workspaceId,
      actorUserId: undefined,
      eventType: 'suite.rollout_promoted',
      entityType: 'automation_suite',
      entityId: suite.id,
      requestId: `rollout-auto-${Date.now()}`,
      metadataJson: {
        fromStage: suite.rolloutStage,
        toStage: nextStage,
        passRate: Math.round(passRate * 100),
        recentRunCount: recentRuns.length,
      },
    });

    this.logger.log(
      `Promoted suite "${suite.name}" (${suite.id}) from ${suite.rolloutStage} → ${nextStage} (pass rate: ${Math.round(passRate * 100)}%)`,
    );

    return true;
  }

  private getNextStage(current: RolloutStage): RolloutStage | null {
    switch (current) {
      case RolloutStage.INTERNAL:
        return RolloutStage.PILOT;
      case RolloutStage.PILOT:
        return RolloutStage.GENERAL;
      default:
        return null;
    }
  }
}
