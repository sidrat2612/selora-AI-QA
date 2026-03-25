ALTER TABLE "users"
  ADD COLUMN "prefersCompactNavigation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "prefersEmailNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "prefersRunDigest" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "prefersAutoOpenFailures" BOOLEAN NOT NULL DEFAULT true;