-- CreateEnum
CREATE TYPE "TestRailIntegrationStatus" AS ENUM ('CONNECTED', 'INVALID', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "TestRailSyncPolicy" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "TestRailSyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "TestRailCaseLinkStatus" AS ENUM ('MAPPED', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "testrail_suite_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "suiteIdExternal" TEXT,
    "sectionId" TEXT,
    "username" TEXT NOT NULL,
    "secretRef" TEXT,
    "encryptedApiKeyJson" TEXT,
    "status" "TestRailIntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "syncPolicy" "TestRailSyncPolicy" NOT NULL DEFAULT 'MANUAL',
    "healthSummaryJson" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "secretRotatedAt" TIMESTAMP(3),
    "secretRotatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testrail_suite_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_test_case_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "canonicalTestId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalCaseId" TEXT NOT NULL,
    "status" "TestRailCaseLinkStatus" NOT NULL DEFAULT 'MAPPED',
    "ownerEmail" TEXT,
    "titleSnapshot" TEXT,
    "sectionNameSnapshot" TEXT,
    "syncSnapshotJson" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "retryEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_test_case_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testrail_sync_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "startedByUserId" TEXT,
    "status" "TestRailSyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "scope" TEXT NOT NULL DEFAULT 'suite',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "syncedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "testrail_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "testrail_suite_integrations_suiteId_key" ON "testrail_suite_integrations"("suiteId");

-- CreateIndex
CREATE INDEX "testrail_suite_integrations_workspaceId_status_idx" ON "testrail_suite_integrations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "testrail_suite_integrations_tenantId_updatedAt_idx" ON "testrail_suite_integrations"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_test_case_links_canonicalTestId_key" ON "external_test_case_links"("canonicalTestId");

-- CreateIndex
CREATE INDEX "external_test_case_links_suiteId_status_updatedAt_idx" ON "external_test_case_links"("suiteId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_test_case_links_integrationId_externalCaseId_key" ON "external_test_case_links"("integrationId", "externalCaseId");

-- CreateIndex
CREATE INDEX "testrail_sync_runs_workspaceId_startedAt_idx" ON "testrail_sync_runs"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "testrail_sync_runs_suiteId_status_startedAt_idx" ON "testrail_sync_runs"("suiteId", "status", "startedAt");

-- AddForeignKey
ALTER TABLE "testrail_suite_integrations" ADD CONSTRAINT "testrail_suite_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_suite_integrations" ADD CONSTRAINT "testrail_suite_integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_suite_integrations" ADD CONSTRAINT "testrail_suite_integrations_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_suite_integrations" ADD CONSTRAINT "testrail_suite_integrations_secretRotatedByUserId_fkey" FOREIGN KEY ("secretRotatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_test_case_links" ADD CONSTRAINT "external_test_case_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_test_case_links" ADD CONSTRAINT "external_test_case_links_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_test_case_links" ADD CONSTRAINT "external_test_case_links_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "canonical_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_test_case_links" ADD CONSTRAINT "external_test_case_links_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "testrail_suite_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_sync_runs" ADD CONSTRAINT "testrail_sync_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_sync_runs" ADD CONSTRAINT "testrail_sync_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_sync_runs" ADD CONSTRAINT "testrail_sync_runs_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_sync_runs" ADD CONSTRAINT "testrail_sync_runs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "testrail_suite_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testrail_sync_runs" ADD CONSTRAINT "testrail_sync_runs_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
