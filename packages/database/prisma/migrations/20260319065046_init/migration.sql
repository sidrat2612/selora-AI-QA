-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('PLATFORM_ADMIN', 'TENANT_ADMIN', 'TENANT_OPERATOR', 'TENANT_VIEWER', 'WORKSPACE_OPERATOR', 'WORKSPACE_VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EnvironmentStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RecordingSourceType" AS ENUM ('PLAYWRIGHT_CODEGEN_TS');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'NORMALIZED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('INGESTED', 'GENERATED', 'VALIDATING', 'VALIDATED', 'AUTO_REPAIRED', 'NEEDS_HUMAN_REVIEW', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GeneratedTestStatus" AS ENUM ('CREATED', 'VALIDATING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RunType" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'VALIDATING', 'REPAIRING', 'READY', 'RUNNING', 'PASSED', 'FAILED', 'CANCELED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('LOG', 'SCREENSHOT', 'TRACE', 'VIDEO', 'GENERATED_TEST', 'REPAIR_DIFF');

-- CreateEnum
CREATE TYPE "RepairMode" AS ENUM ('RULE_BASED', 'LLM_ASSISTED');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('SUGGESTED', 'APPLIED', 'RERUN_PASSED', 'RERUN_FAILED', 'ABANDONED', 'HUMAN_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('RUN_COUNT', 'EXECUTION_MINUTES', 'ARTIFACT_STORAGE_BYTES', 'CONCURRENT_EXECUTIONS', 'AI_REPAIR_ATTEMPTS', 'USER_SEATS', 'WORKSPACE_COUNT');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL DEFAULT 1,
    "emailVerifiedAt" TIMESTAMP(3),
    "resetRequestedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "secretRef" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "EnvironmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_assets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" "RecordingSourceType" NOT NULL DEFAULT 'PLAYWRIGHT_CODEGEN_TS',
    "filename" TEXT NOT NULL,
    "originalPath" TEXT,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadataJson" JSONB,
    "status" "RecordingStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_tests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recordingAssetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tagsJson" JSONB NOT NULL DEFAULT '[]',
    "canonicalVersion" INTEGER NOT NULL DEFAULT 1,
    "definitionJson" JSONB NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'INGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_test_artifacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "canonicalTestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "generatorVersion" TEXT NOT NULL,
    "status" "GeneratedTestStatus" NOT NULL DEFAULT 'CREATED',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_test_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "triggeredByUserId" TEXT NOT NULL,
    "runType" "RunType" NOT NULL DEFAULT 'MANUAL',
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "runningCount" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "canceledCount" INTEGER NOT NULL DEFAULT 0,
    "timedOutCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_run_items" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "canonicalTestId" TEXT NOT NULL,
    "generatedTestArtifactId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "failureSummary" TEXT,
    "workerJobId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "test_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "testRunId" TEXT,
    "testRunItemId" TEXT,
    "artifactType" "ArtifactType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_repair_attempts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "canonicalTestId" TEXT NOT NULL,
    "generatedTestArtifactId" TEXT NOT NULL,
    "testRunId" TEXT,
    "testRunItemId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "repairMode" "RepairMode" NOT NULL,
    "inputFailureHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelName" TEXT,
    "status" "RepairStatus" NOT NULL DEFAULT 'SUGGESTED',
    "diffSummary" TEXT,
    "patchStorageKey" TEXT,
    "sanitizationMetadataJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_repair_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_meters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "metricType" "MetricType" NOT NULL,
    "metricWindowStart" TIMESTAMP(3) NOT NULL,
    "metricWindowEnd" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "logsDays" INTEGER NOT NULL DEFAULT 30,
    "screenshotsDays" INTEGER NOT NULL DEFAULT 14,
    "videosDays" INTEGER NOT NULL DEFAULT 7,
    "tracesDays" INTEGER NOT NULL DEFAULT 14,
    "auditDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_tenantId_slug_key" ON "workspaces"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_userId_workspaceId_role_key" ON "memberships"("tenantId", "userId", "workspaceId", "role");

-- CreateIndex
CREATE INDEX "canonical_tests_workspaceId_status_updatedAt_idx" ON "canonical_tests"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "test_runs_workspaceId_createdAt_status_idx" ON "test_runs"("workspaceId", "createdAt", "status");

-- CreateIndex
CREATE INDEX "test_run_items_testRunId_status_idx" ON "test_run_items"("testRunId", "status");

-- CreateIndex
CREATE INDEX "artifacts_workspaceId_testRunId_artifactType_idx" ON "artifacts"("workspaceId", "testRunId", "artifactType");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_workspaceId_createdAt_eventType_idx" ON "audit_events"("tenantId", "workspaceId", "createdAt", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "ai_repair_attempts_generatedTestArtifactId_attemptNumber_key" ON "ai_repair_attempts"("generatedTestArtifactId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "retention_settings_workspaceId_key" ON "retention_settings"("workspaceId");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_assets" ADD CONSTRAINT "recording_assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_assets" ADD CONSTRAINT "recording_assets_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_tests" ADD CONSTRAINT "canonical_tests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_tests" ADD CONSTRAINT "canonical_tests_recordingAssetId_fkey" FOREIGN KEY ("recordingAssetId") REFERENCES "recording_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_test_artifacts" ADD CONSTRAINT "generated_test_artifacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_test_artifacts" ADD CONSTRAINT "generated_test_artifacts_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "canonical_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_test_artifacts" ADD CONSTRAINT "generated_test_artifacts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "canonical_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_generatedTestArtifactId_fkey" FOREIGN KEY ("generatedTestArtifactId") REFERENCES "generated_test_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_testRunItemId_fkey" FOREIGN KEY ("testRunItemId") REFERENCES "test_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_repair_attempts" ADD CONSTRAINT "ai_repair_attempts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_repair_attempts" ADD CONSTRAINT "ai_repair_attempts_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "canonical_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_repair_attempts" ADD CONSTRAINT "ai_repair_attempts_generatedTestArtifactId_fkey" FOREIGN KEY ("generatedTestArtifactId") REFERENCES "generated_test_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_repair_attempts" ADD CONSTRAINT "ai_repair_attempts_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_repair_attempts" ADD CONSTRAINT "ai_repair_attempts_testRunItemId_fkey" FOREIGN KEY ("testRunItemId") REFERENCES "test_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_settings" ADD CONSTRAINT "retention_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
