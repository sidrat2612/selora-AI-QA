import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import type { AppRequest } from '../common/types';
import { forbidden } from '../common/http-errors';
import { getLicenseConfig, type LicensedFeature, type LicenseTier } from './license.config';

type LicenseStatus = {
  enforcementEnabled: boolean;
  tier: LicenseTier;
  commercialUseAllowed: boolean;
  licensedTo: string | null;
  alertEmailConfigured: boolean;
  protectedFeatures: LicensedFeature[];
};

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly auditService: AuditService,
  ) {}

  getStatus(): LicenseStatus {
    const config = getLicenseConfig(process.env);
    const commercialUseAllowed =
      !config.enforcementEnabled || (config.tier === 'commercial' && Boolean(config.key));

    return {
      enforcementEnabled: config.enforcementEnabled,
      tier: config.tier,
      commercialUseAllowed,
      licensedTo: config.licensedTo,
      alertEmailConfigured: Boolean(config.alertEmail),
      protectedFeatures: ['github_integration', 'testrail_integration', 'artifact_publication'],
    };
  }

  assertFeatureAllowed(feature: LicensedFeature) {
    const status = this.getStatus();
    if (!status.enforcementEnabled) {
      return;
    }

    if (status.tier === 'commercial' && status.commercialUseAllowed) {
      return;
    }

    throw forbidden(
      'LICENSE_REQUIRED',
      'This feature requires a commercial Selora license.',
      {
        feature,
        tier: status.tier,
        commercialUseAllowed: status.commercialUseAllowed,
      },
    );
  }

  async notifyBlockedFeatureAttempt(feature: LicensedFeature, request: AppRequest) {
    const status = this.getStatus();
    const auth = request.auth;

    const metadata = {
      feature,
      requestPath: request.originalUrl,
      requestMethod: request.method,
      requestId: request.requestId,
      actorEmail: auth?.user.email ?? null,
      actorName: auth?.user.name ?? null,
      userId: auth?.user.id ?? null,
      tenantId: request.resourceTenantId ?? null,
      workspaceId: request.resourceWorkspaceId ?? null,
      tier: status.tier,
    };

    if (request.resourceTenantId && auth?.user.id) {
      await this.auditService.record({
        tenantId: request.resourceTenantId,
        workspaceId: request.resourceWorkspaceId ?? null,
        actorUserId: auth.user.id,
        eventType: 'license.feature_blocked',
        entityType: 'license',
        entityId: feature,
        requestId: request.requestId,
        metadataJson: metadata,
      });
    }

    if (status.alertEmailConfigured) {
      try {
        await this.mailerService.sendLicenseComplianceAlert({
          to: getLicenseConfig(process.env).alertEmail as string,
          feature,
          requestPath: request.originalUrl,
          requestMethod: request.method,
          requestId: request.requestId,
          actorEmail: auth?.user.email ?? null,
          actorName: auth?.user.name ?? null,
          tenantId: request.resourceTenantId ?? null,
          workspaceId: request.resourceWorkspaceId ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown mailer error';
        this.logger.warn(`Failed to send license compliance alert: ${message}`);
      }
    }
  }
}
