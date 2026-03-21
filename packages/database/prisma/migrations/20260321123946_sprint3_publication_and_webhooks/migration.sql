-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'MERGED', 'CLOSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PublicationPullRequestState" AS ENUM ('OPEN', 'CLOSED', 'MERGED');

-- CreateEnum
CREATE TYPE "GitHubWebhookDeliveryStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterTable
ALTER TABLE "github_suite_integrations" ADD COLUMN     "webhookSecretEncryptedJson" TEXT,
ADD COLUMN     "webhookSecretRef" TEXT,
ADD COLUMN     "webhookSecretRotatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "generated_artifact_publications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "githubIntegrationId" TEXT NOT NULL,
    "canonicalTestId" TEXT NOT NULL,
    "generatedTestArtifactId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "targetPath" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "pullRequestNumber" INTEGER,
    "pullRequestUrl" TEXT,
    "pullRequestState" "PublicationPullRequestState",
    "headCommitSha" TEXT,
    "mergeCommitSha" TEXT,
    "lastError" TEXT,
    "lastAttemptedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "mergedAt" TIMESTAMP(3),
    "lastWebhookEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_artifact_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "githubIntegrationId" TEXT NOT NULL,
    "publicationId" TEXT,
    "deliveryId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "action" TEXT,
    "status" "GitHubWebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "payloadJson" JSONB NOT NULL,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "replayedAt" TIMESTAMP(3),

    CONSTRAINT "github_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_artifact_publications_generatedTestArtifactId_key" ON "generated_artifact_publications"("generatedTestArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_artifact_publications_idempotencyKey_key" ON "generated_artifact_publications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "generated_artifact_publications_workspaceId_status_updatedA_idx" ON "generated_artifact_publications"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "generated_artifact_publications_suiteId_createdAt_idx" ON "generated_artifact_publications"("suiteId", "createdAt");

-- CreateIndex
CREATE INDEX "generated_artifact_publications_githubIntegrationId_branchN_idx" ON "generated_artifact_publications"("githubIntegrationId", "branchName");

-- CreateIndex
CREATE INDEX "generated_artifact_publications_githubIntegrationId_pullReq_idx" ON "generated_artifact_publications"("githubIntegrationId", "pullRequestNumber");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_publicationId_receivedAt_idx" ON "github_webhook_deliveries"("publicationId", "receivedAt");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_workspaceId_status_receivedAt_idx" ON "github_webhook_deliveries"("workspaceId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "github_webhook_deliveries_githubIntegrationId_deliveryId_key" ON "github_webhook_deliveries"("githubIntegrationId", "deliveryId");

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_githubIntegrationId_fkey" FOREIGN KEY ("githubIntegrationId") REFERENCES "github_suite_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "canonical_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_generatedTestArtifactId_fkey" FOREIGN KEY ("generatedTestArtifactId") REFERENCES "generated_test_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifact_publications" ADD CONSTRAINT "generated_artifact_publications_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "github_webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "github_webhook_deliveries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "github_webhook_deliveries_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "github_webhook_deliveries_githubIntegrationId_fkey" FOREIGN KEY ("githubIntegrationId") REFERENCES "github_suite_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "github_webhook_deliveries_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "generated_artifact_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
