-- AlterTable
ALTER TABLE "environments" ADD COLUMN     "encryptedSecretJson" TEXT,
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "runTimeoutMs" INTEGER NOT NULL DEFAULT 3600000,
ADD COLUMN     "testTimeoutMs" INTEGER NOT NULL DEFAULT 120000;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "concurrentExecutionLimit" INTEGER NOT NULL DEFAULT 5;
