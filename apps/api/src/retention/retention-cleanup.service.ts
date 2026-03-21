import { Injectable } from '@nestjs/common';
import { ArtifactType } from '@selora/database';
import { PrismaService } from '../database/prisma.service';
import { deleteStoredObject, getStorageConfig } from '@selora/storage';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RetentionCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async runCleanup() {
    const workspaces = await this.prisma.retentionSetting.findMany({
      include: {
        workspace: {
          select: { id: true, tenantId: true },
        },
      },
    });

    const summary: Array<{
      workspaceId: string;
      deletedArtifacts: number;
      deletedAuditEvents: number;
    }> = [];

    for (const setting of workspaces) {
      const result = await this.cleanupWorkspace(setting);
      summary.push(result);
    }

    return summary;
  }

  private async cleanupWorkspace(setting: {
    workspaceId: string;
    logsDays: number;
    screenshotsDays: number;
    videosDays: number;
    tracesDays: number;
    auditDays: number;
    workspace: { id: string; tenantId: string };
  }) {
    const now = new Date();
    const storageConfig = getStorageConfig();
    let deletedArtifacts = 0;
    let deletedAuditEvents = 0;

    const artifactRules: Array<{ artifactTypes: ArtifactType[]; days: number }> = [
      { artifactTypes: [ArtifactType.LOG], days: setting.logsDays },
      { artifactTypes: [ArtifactType.SCREENSHOT], days: setting.screenshotsDays },
      { artifactTypes: [ArtifactType.VIDEO], days: setting.videosDays },
      { artifactTypes: [ArtifactType.TRACE], days: setting.tracesDays },
    ];

    for (const rule of artifactRules) {
      const cutoff = new Date(now.getTime() - rule.days * 24 * 60 * 60 * 1000);

      const expired = await this.prisma.artifact.findMany({
        where: {
          workspaceId: setting.workspaceId,
          artifactType: { in: rule.artifactTypes },
          createdAt: { lt: cutoff },
        },
        select: { id: true, storageKey: true },
      });

      for (const artifact of expired) {
        try {
          await deleteStoredObject({ config: storageConfig, key: artifact.storageKey });
        } catch {
          // storage deletion is best-effort; DB record still removed
        }

        await this.prisma.artifact.delete({ where: { id: artifact.id } });
        deletedArtifacts += 1;
      }
    }

    const auditCutoff = new Date(now.getTime() - setting.auditDays * 24 * 60 * 60 * 1000);
    const auditDeleteResult = await this.prisma.auditEvent.deleteMany({
      where: {
        workspaceId: setting.workspaceId,
        createdAt: { lt: auditCutoff },
      },
    });
    deletedAuditEvents = auditDeleteResult.count;

    if (deletedArtifacts > 0 || deletedAuditEvents > 0) {
      await this.auditService.record({
        tenantId: setting.workspace.tenantId,
        workspaceId: setting.workspaceId,
        eventType: 'retention.cleanup_completed',
        entityType: 'workspace',
        entityId: setting.workspaceId,
        metadataJson: {
          deletedArtifacts,
          deletedAuditEvents,
          logsDays: setting.logsDays,
          screenshotsDays: setting.screenshotsDays,
          videosDays: setting.videosDays,
          tracesDays: setting.tracesDays,
          auditDays: setting.auditDays,
        },
      });
    }

    return {
      workspaceId: setting.workspaceId,
      deletedArtifacts,
      deletedAuditEvents,
    };
  }
}
