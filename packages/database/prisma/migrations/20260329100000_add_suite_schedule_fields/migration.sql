-- AlterEnum
ALTER TYPE "RunType" ADD VALUE 'SCHEDULED';
ALTER TYPE "RunType" ADD VALUE 'CI_TRIGGERED';

-- AlterTable
ALTER TABLE "automation_suites" ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automation_suites" ADD COLUMN "scheduleCron" TEXT;
ALTER TABLE "automation_suites" ADD COLUMN "scheduleEnvironmentId" TEXT;
ALTER TABLE "automation_suites" ADD COLUMN "scheduleTimezone" TEXT NOT NULL DEFAULT 'UTC';

-- AddForeignKey
ALTER TABLE "automation_suites" ADD CONSTRAINT "automation_suites_scheduleEnvironmentId_fkey" FOREIGN KEY ("scheduleEnvironmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
