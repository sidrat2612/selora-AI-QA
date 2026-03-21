ALTER TABLE "tenants"
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "softDeleteRequestedAt" TIMESTAMP(3),
ADD COLUMN "softDeleteScheduledFor" TIMESTAMP(3);