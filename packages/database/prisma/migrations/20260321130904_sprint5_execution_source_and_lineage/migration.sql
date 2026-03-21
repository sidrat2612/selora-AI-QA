-- CreateEnum
CREATE TYPE "ExecutionSourceRequestMode" AS ENUM ('SUITE_DEFAULT', 'PINNED_COMMIT', 'BRANCH_HEAD');

-- CreateEnum
CREATE TYPE "ExecutionSourceMode" AS ENUM ('STORAGE_ARTIFACT', 'PINNED_COMMIT', 'BRANCH_HEAD');

-- AlterTable
ALTER TABLE "automation_suites" ADD COLUMN     "allowBranchHeadExecution" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowStorageExecutionFallback" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "executionSourcePolicy" "ExecutionSourceMode" NOT NULL DEFAULT 'STORAGE_ARTIFACT';

-- AlterTable
ALTER TABLE "test_run_items" ADD COLUMN     "publicationId" TEXT,
ADD COLUMN     "requestedGitRef" TEXT,
ADD COLUMN     "requestedSourceMode" "ExecutionSourceRequestMode" NOT NULL DEFAULT 'SUITE_DEFAULT',
ADD COLUMN     "resolvedCommitSha" TEXT,
ADD COLUMN     "resolvedGitRef" TEXT,
ADD COLUMN     "resolvedSourceMode" "ExecutionSourceMode" NOT NULL DEFAULT 'STORAGE_ARTIFACT',
ADD COLUMN     "sourceFallbackReason" TEXT;

-- AlterTable
ALTER TABLE "test_runs" ADD COLUMN     "requestedGitRef" TEXT,
ADD COLUMN     "requestedSourceMode" "ExecutionSourceRequestMode" NOT NULL DEFAULT 'SUITE_DEFAULT';

-- CreateIndex
CREATE INDEX "test_run_items_testRunId_resolvedSourceMode_idx" ON "test_run_items"("testRunId", "resolvedSourceMode");

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "generated_artifact_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
