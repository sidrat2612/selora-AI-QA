BEGIN;

DELETE FROM "memberships" AS legacy
USING "memberships" AS modern
WHERE legacy."role" = 'WORKSPACE_OPERATOR'
  AND modern."role" = 'TENANT_OPERATOR'
  AND modern."tenantId" = legacy."tenantId"
  AND modern."userId" = legacy."userId"
  AND modern."workspaceId" = legacy."workspaceId";

DELETE FROM "memberships" AS legacy
USING "memberships" AS modern
WHERE legacy."role" = 'WORKSPACE_VIEWER'
  AND modern."role" = 'TENANT_VIEWER'
  AND modern."tenantId" = legacy."tenantId"
  AND modern."userId" = legacy."userId"
  AND modern."workspaceId" = legacy."workspaceId";

UPDATE "memberships"
SET "role" = 'TENANT_OPERATOR'
WHERE "role" = 'WORKSPACE_OPERATOR';

UPDATE "memberships"
SET "role" = 'TENANT_VIEWER'
WHERE "role" = 'WORKSPACE_VIEWER';

ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_old";

CREATE TYPE "MembershipRole" AS ENUM (
  'PLATFORM_ADMIN',
  'TENANT_ADMIN',
  'TENANT_OPERATOR',
  'TENANT_VIEWER'
);

ALTER TABLE "memberships"
ALTER COLUMN "role" TYPE "MembershipRole"
USING ("role"::text::"MembershipRole");

DROP TYPE "MembershipRole_old";

COMMIT;