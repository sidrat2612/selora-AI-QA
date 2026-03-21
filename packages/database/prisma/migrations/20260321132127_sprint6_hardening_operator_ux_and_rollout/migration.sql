-- CreateEnum
CREATE TYPE "RolloutStage" AS ENUM ('INTERNAL', 'PILOT', 'GENERAL');

-- AlterTable
ALTER TABLE "automation_suites" ADD COLUMN     "gitExecutionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "githubPublishingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rolloutStage" "RolloutStage" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "testRailSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
