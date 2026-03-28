import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { RecordingsService } from '../recordings/recordings.service';
import { AuditService } from '../audit/audit.service';

/**
 * Evaluates suites with scheduling enabled every minute and triggers
 * runs whose cron expression matches the current time.
 *
 * Scheduling fields on AutomationSuite:
 *  - scheduleEnabled (boolean)
 *  - scheduleCron    (string, 5-field cron)
 *  - scheduleEnvironmentId (string, FK to Environment)
 *  - scheduleTimezone (string, IANA tz, default UTC)
 */
@Injectable()
export class ScheduledRunService {
  private readonly logger = new Logger(ScheduledRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recordingsService: RecordingsService,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateScheduledSuites() {
    const suites = await this.prisma.automationSuite.findMany({
      where: {
        scheduleEnabled: true,
        scheduleCron: { not: null },
        scheduleEnvironmentId: { not: null },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        name: true,
        scheduleCron: true,
        scheduleEnvironmentId: true,
        scheduleTimezone: true,
      },
    });

    if (suites.length === 0) return;

    const now = new Date();

    for (const suite of suites) {
      try {
        if (!this.cronMatchesNow(suite.scheduleCron!, now, suite.scheduleTimezone)) {
          continue;
        }

        // Prevent duplicate runs within the same minute
        const recentRun = await this.prisma.testRun.findFirst({
          where: {
            suiteId: suite.id,
            runType: 'SCHEDULED',
            createdAt: { gte: new Date(now.getTime() - 60_000) },
          },
          select: { id: true },
        });

        if (recentRun) continue;

        // Find a system user to act as the triggeredBy user (first tenant admin)
        const systemMembership = await this.prisma.membership.findFirst({
          where: {
            tenantId: suite.tenantId,
            role: 'TENANT_ADMIN',
            status: 'ACTIVE',
          },
          select: { userId: true, user: { select: { id: true, email: true, name: true, memberships: true } } },
        });

        if (!systemMembership) {
          this.logger.warn(`No active tenant admin found for suite ${suite.id}, skipping scheduled run.`);
          continue;
        }

        await this.recordingsService.createScheduledRun(
          suite.workspaceId,
          suite.id,
          suite.scheduleEnvironmentId!,
          suite.tenantId,
          systemMembership.userId,
        );

        this.logger.log(`Scheduled run triggered for suite "${suite.name}" (${suite.id})`);
      } catch (error) {
        this.logger.warn(`Failed to trigger scheduled run for suite ${suite.id}: ${error}`);
      }
    }
  }

  /**
   * Minimal 5-field cron matcher (minute hour dom month dow).
   * Supports: numbers, *, and step expressions (e.g. *​/5).
   */
  private cronMatchesNow(cron: string, now: Date, timezone: string): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    // Convert to the suite's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      day: 'numeric',
      month: 'numeric',
      weekday: 'short',
      hour12: false,
    });
    const dateParts = Object.fromEntries(
      formatter.formatToParts(now).map((p) => [p.type, p.value]),
    ) as Record<string, string | undefined>;

    const minuteText = dateParts['minute'];
    const hourText = dateParts['hour'];
    const dayText = dateParts['day'];
    const monthText = dateParts['month'];
    const weekdayText = dateParts['weekday'];

    if (!minuteText || !hourText || !dayText || !monthText || !weekdayText) {
      return false;
    }

    const minute = parseInt(minuteText, 10);
    const hour = parseInt(hourText, 10);
    const dayOfMonth = parseInt(dayText, 10);
    const month = parseInt(monthText, 10);
    const weekdayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dayOfWeek = weekdayMap[weekdayText] ?? 0;

    const values = [minute, hour, dayOfMonth, month, dayOfWeek];
    const maxValues = [59, 23, 31, 12, 6];

    return parts.every((field, i) => {
      const value = values[i];
      const maxValue = maxValues[i];
      if (value === undefined || maxValue === undefined) return false;
      return this.fieldMatches(field, value, maxValue);
    });
  }

  private fieldMatches(field: string, value: number, _max: number): boolean {
    if (field === '*') return true;

    // Step: */n
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      if (isNaN(step) || step <= 0) return false;
      return value % step === 0;
    }

    // Comma-separated values
    const allowedValues = field.split(',').map((v) => parseInt(v, 10));
    return allowedValues.includes(value);
  }
}
