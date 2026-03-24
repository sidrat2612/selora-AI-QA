import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditController } from './audit/audit.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RolesGuard } from './auth/roles.guard';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { GitHubIntegrationController } from './github/github-integration.controller';
import { GitHubIntegrationService } from './github/github-integration.service';
import { GitHubPublicationService } from './github/github-publication.service';
import { GitHubWebhookController } from './github/github-webhook.controller';
import { RepositoryAllowlistService } from './github/repository-allowlist.service';
import { SuitesController } from './suites/suites.controller';
import { SuitesService } from './suites/suites.service';
import { RolloutAutomationService } from './suites/rollout-automation.service';
import { TenantAccessGuard } from './auth/tenant-access.guard';
import { WorkspaceAccessGuard } from './auth/workspace-access.guard';
import { AuditService } from './audit/audit.service';
import { FeedbackController } from './feedback/feedback.controller';
import { FeedbackService } from './feedback/feedback.service';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { PrismaService } from './database/prisma.service';
import { HealthController } from './health.controller';
import { MailerService } from './mail/mailer.service';
import { AIRepairProcessor } from './recordings/ai-repair.processor';
import { AIRepairQueueService } from './recordings/ai-repair.queue';
import { ExecutionSourceResolverService } from './recordings/execution-source-resolver.service';
import { RecordingsController } from './recordings/recordings.controller';
import { RecordingIngestionProcessor } from './recordings/recording-ingestion.processor';
import { RecordingIngestionQueueService } from './recordings/recording-ingestion.queue';
import { RecordingsService } from './recordings/recordings.service';
import { RequestRateLimitService } from './rate-limits/request-rate-limit.service';
import { RetentionCleanupController } from './retention/retention-cleanup.controller';
import { RetentionCleanupService } from './retention/retention-cleanup.service';
import { TestExecutionProcessor } from './recordings/test-execution.processor';
import { TestExecutionQueueService } from './recordings/test-execution.queue';
import { TestValidationProcessor } from './recordings/test-validation.processor';
import { TestValidationQueueService } from './recordings/test-validation.queue';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsService } from './tenants/tenants.service';
import { QuotaController } from './usage/quota.controller';
import { QuotaService } from './usage/quota.service';
import { LicenseController } from './licensing/license.controller';
import { LicenseGuard } from './licensing/license.guard';
import { LicenseService } from './licensing/license.service';
import { TestRailIntegrationController } from './testrail/testrail-integration.controller';
import { TestRailIntegrationService } from './testrail/testrail-integration.service';
import { TestCasesController } from './test-cases/test-cases.controller';
import { TestCasesService } from './test-cases/test-cases.service';
import { UsageController } from './usage/usage.controller';
import { UsageMeterService } from './usage/usage-meter.service';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { WorkspacesService } from './workspaces/workspaces.service';
import { NotificationController } from './notifications/notification.controller';
import { NotificationService } from './notifications/notification.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60_000,
        limit: 20,
      },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    WorkspacesController,
    SuitesController,
    GitHubIntegrationController,
    GitHubWebhookController,
    TestRailIntegrationController,
    TestCasesController,
    RecordingsController,
    FeedbackController,
    AuditController,
    TenantsController,
    UsageController,
    QuotaController,
    RetentionCleanupController,
    LicenseController,
    NotificationController,
  ],
  providers: [
    PrismaService,
    MailerService,
    AuditService,
    FeedbackService,
    AuthService,
    WorkspacesService,
    SuitesService,
    RolloutAutomationService,
    GitHubIntegrationService,
    GitHubPublicationService,
    RepositoryAllowlistService,
    TestRailIntegrationService,
    TestCasesService,
    ExecutionSourceResolverService,
    AIRepairProcessor,
    AIRepairQueueService,
    RecordingIngestionProcessor,
    RecordingIngestionQueueService,
    TestExecutionProcessor,
    TestExecutionQueueService,
    TestValidationProcessor,
    TestValidationQueueService,
    RecordingsService,
    RetentionCleanupService,
    NotificationService,
    TenantsService,
    UsageMeterService,
    QuotaService,
    LicenseService,
    LicenseGuard,
    RequestRateLimitService,
    SessionAuthGuard,
    RolesGuard,
    TenantAccessGuard,
    WorkspaceAccessGuard,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
