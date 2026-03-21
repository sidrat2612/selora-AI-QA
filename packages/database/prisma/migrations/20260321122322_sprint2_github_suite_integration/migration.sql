-- CreateEnum
CREATE TYPE "GitHubCredentialMode" AS ENUM ('PAT', 'GITHUB_APP');

-- CreateEnum
CREATE TYPE "GitHubIntegrationStatus" AS ENUM ('CONNECTED', 'INVALID', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "GitHubWriteScope" AS ENUM ('READ_ONLY', 'BRANCH_PUSH', 'PULL_REQUESTS');

-- CreateTable
CREATE TABLE "github_suite_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "credentialMode" "GitHubCredentialMode" NOT NULL,
    "status" "GitHubIntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "workflowPath" TEXT,
    "allowedWriteScope" "GitHubWriteScope" NOT NULL DEFAULT 'READ_ONLY',
    "pullRequestRequired" BOOLEAN NOT NULL DEFAULT true,
    "secretRef" TEXT,
    "encryptedSecretJson" TEXT,
    "appId" TEXT,
    "appSlug" TEXT,
    "installationId" TEXT,
    "healthSummaryJson" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "secretRotatedAt" TIMESTAMP(3),
    "secretRotatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_suite_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_suite_integrations_suiteId_key" ON "github_suite_integrations"("suiteId");

-- CreateIndex
CREATE INDEX "github_suite_integrations_workspaceId_status_idx" ON "github_suite_integrations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "github_suite_integrations_tenantId_updatedAt_idx" ON "github_suite_integrations"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "github_suite_integrations_repoOwner_repoName_idx" ON "github_suite_integrations"("repoOwner", "repoName");

-- AddForeignKey
ALTER TABLE "github_suite_integrations" ADD CONSTRAINT "github_suite_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_suite_integrations" ADD CONSTRAINT "github_suite_integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_suite_integrations" ADD CONSTRAINT "github_suite_integrations_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_suite_integrations" ADD CONSTRAINT "github_suite_integrations_secretRotatedByUserId_fkey" FOREIGN KEY ("secretRotatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
