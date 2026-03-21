-- CreateEnum
CREATE TYPE "SuiteStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "canonical_tests" ADD COLUMN     "suiteId" TEXT;

-- CreateTable
CREATE TABLE "automation_suites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SuiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_suites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_suites_workspaceId_status_idx" ON "automation_suites"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "automation_suites_tenantId_createdAt_idx" ON "automation_suites"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_suites_workspaceId_slug_key" ON "automation_suites"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "canonical_tests_suiteId_updatedAt_idx" ON "canonical_tests"("suiteId", "updatedAt");

-- AddForeignKey
ALTER TABLE "automation_suites" ADD CONSTRAINT "automation_suites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_suites" ADD CONSTRAINT "automation_suites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_tests" ADD CONSTRAINT "canonical_tests_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "automation_suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
