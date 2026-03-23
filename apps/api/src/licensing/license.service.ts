import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import type { AppRequest } from '../common/types';
import { forbidden } from '../common/http-errors';
import {
  getLicenseConfig,
  PROTECTED_LICENSE_FEATURES,
  type LicensedFeature,
  type LicenseConfig,
  type LicenseTier,
} from './license.config';

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

  private getConfig(): LicenseConfig {
    return getLicenseConfig(process.env);
  }

  private buildStatus(config: LicenseConfig): LicenseStatus {
    return {
      enforcementEnabled: config.enforcementEnabled,
      tier: config.tier,
      commercialUseAllowed: !config.enforcementEnabled || this.hasCommercialAccess(config),
      licensedTo: config.licensedTo,
      alertEmailConfigured: Boolean(config.alertEmail),
      protectedFeatures: [...PROTECTED_LICENSE_FEATURES],
    };
  }

  private hasCommercialAccess(config: LicenseConfig): boolean {
    return config.tier === 'commercial' && Boolean(config.key);
  }

  getStatus(): LicenseStatus {
    return this.buildStatus(this.getConfig());
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
    const config = this.getConfig();
    const status = this.buildStatus(config);
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

    if (config.alertEmail) {
      try {
        await this.mailerService.sendLicenseComplianceAlert({
          to: config.alertEmail,
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
