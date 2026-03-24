-- CreateEnum
CREATE TYPE "BusinessTestCaseFormat" AS ENUM ('SIMPLE', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "BusinessTestCaseSource" AS ENUM ('MANUAL', 'TESTRAIL_IMPORT');

-- CreateEnum
CREATE TYPE "BusinessTestCaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BusinessTestCasePriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TestCaseVerdict" AS ENUM ('PASSED', 'FAILED', 'NOT_COVERED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ScreenshotPolicy" AS ENUM ('ALWAYS', 'ON_FAIL_ONLY', 'NEVER');

-- AlterTable: automation_suites — add screenshotPolicy
ALTER TABLE "automation_suites" ADD COLUMN "screenshotPolicy" "ScreenshotPolicy" NOT NULL DEFAULT 'ALWAYS';

-- AlterTable: test_runs — add suiteId
ALTER TABLE "test_runs" ADD COLUMN "suiteId" TEXT;

-- AlterTable: external_test_case_links — make canonicalTestId nullable, add businessTestCaseId
ALTER TABLE "external_test_case_links" ALTER COLUMN "canonicalTestId" DROP NOT NULL;
ALTER TABLE "external_test_case_links" ADD COLUMN "businessTestCaseId" TEXT;

-- CreateTable: business_test_cases
CREATE TABLE "business_test_cases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "format" "BusinessTestCaseFormat" NOT NULL DEFAULT 'SIMPLE',
    "source" "BusinessTestCaseSource" NOT NULL DEFAULT 'MANUAL',
    "status" "BusinessTestCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "BusinessTestCasePriority" NOT NULL DEFAULT 'MEDIUM',
    "preconditions" TEXT,
    "stepsJson" JSONB,
    "expectedResult" TEXT,
    "tagsJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable: test_case_script_mappings
CREATE TABLE "test_case_script_mappings" (
    "id" TEXT NOT NULL,
    "businessTestCaseId" TEXT NOT NULL,
    "canonicalTestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_script_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: test_case_results
CREATE TABLE "test_case_results" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "businessTestCaseId" TEXT NOT NULL,
    "verdict" "TestCaseVerdict" NOT NULL DEFAULT 'NOT_COVERED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_case_results_pkey" PRIMARY KEY ("id")
);

-- AlterTable: test_run_items — add testCaseResultId
ALTER TABLE "test_run_items" ADD COLUMN "testCaseResultId" TEXT;

-- CreateIndex
CREATE INDEX "business_test_cases_suiteId_status_updatedAt_idx" ON "business_test_cases"("suiteId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "business_test_cases_workspaceId_status_idx" ON "business_test_cases"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_script_mappings_businessTestCaseId_canonicalTestId_key" ON "test_case_script_mappings"("businessTestCaseId", "canonicalTestId");

-- CreateIndex
CREATE INDEX "test_case_script_mappings_canonicalTestId_idx" ON "test_case_script_mappings"("canonicalTestId");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_results_testRunId_businessTestCaseId_key" ON "test_case_results"("testRunId", "businessTestCaseId");

-- CreateIndex
CREATE INDEX "test_case_results_testRunId_verdict_idx" ON "test_case_results"("testRunId", "verdict");

-- CreateIndex
CREATE INDEX "test_runs_suiteId_createdAt_idx" ON "test_runs"("suiteId", "createdAt");

-- AddForeignKey: test_runs.suiteId → automation_suites
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: test_run_items.testCaseResultId → test_case_results
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_testCaseResultId_fkey" FOREIGN KEY ("testCaseResultId") REFERENCES "test_case_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: external_test_case_links.businessTestCaseId → business_test_cases
ALTER TABLE "external_test_case_links" ADD CONSTRAINT "external_test_case_links_businessTestCaseId_fkey" FOREIGN KEY ("businessTestCaseId") REFERENCES "business_test_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: business_test_cases.workspaceId → workspaces
ALTER TABLE "business_test_cases" ADD CONSTRAINT "business_test_cases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_test_cases.suiteId → automation_suites
ALTER TABLE "business_test_cases" ADD CONSTRAINT "business_test_cases_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: test_case_script_mappings.businessTestCaseId → business_test_cases
ALTER TABLE "test_case_script_mappings" ADD CONSTRAINT "test_case_script_mappings_businessTestCaseId_fkey" FOREIGN KEY ("businessTestCaseId") REFERENCES "business_test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: test_case_script_mappings.canonicalTestId → canonical_tests
ALTER TABLE "test_case_script_mappings" ADD CONSTRAINT "test_case_script_mappings_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "canonical_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: test_case_results.testRunId → test_runs
ALTER TABLE "test_case_results" ADD CONSTRAINT "test_case_results_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: test_case_results.businessTestCaseId → business_test_cases
ALTER TABLE "test_case_results" ADD CONSTRAINT "test_case_results_businessTestCaseId_fkey" FOREIGN KEY ("businessTestCaseId") REFERENCES "business_test_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
