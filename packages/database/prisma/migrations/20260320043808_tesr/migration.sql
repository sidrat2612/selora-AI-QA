-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "maxTestsPerRun" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "runCooldownSeconds" INTEGER NOT NULL DEFAULT 0;
