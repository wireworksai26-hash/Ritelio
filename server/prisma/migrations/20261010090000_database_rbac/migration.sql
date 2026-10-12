BEGIN;

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('allow', 'deny');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role_id" TEXT;

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'allow',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateIndex
CREATE INDEX "roles_tenant_id_rank_idx" ON "roles"("tenant_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_key_key" ON "roles"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_id_key" ON "roles"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_key_idx" ON "role_permissions"("permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_key" ON "users"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("key", "module", "action", "description") VALUES
  ('inventory:read', 'inventory', 'read', 'Read inventory'),
  ('inventory:write', 'inventory', 'write', 'Write inventory'),
  ('purchasing:read', 'purchasing', 'read', 'Read purchasing'),
  ('purchasing:write', 'purchasing', 'write', 'Write purchasing'),
  ('pos:read', 'pos', 'read', 'Read POS'),
  ('pos:write', 'pos', 'write', 'Write POS'),
  ('finance:read', 'finance', 'read', 'Read finance'),
  ('finance:write', 'finance', 'write', 'Write finance'),
  ('ai:use', 'ai', 'use', 'Use AI assistant'),
  ('users:manage', 'users', 'manage', 'Manage users'),
  ('settings:write', 'settings', 'write', 'Write settings'),
  ('notifications:read', 'notifications', 'read', 'Read notifications'),
  ('outlets:read', 'outlets', 'read', 'Read outlets'),
  ('outlets:write', 'outlets', 'write', 'Write outlets')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "roles" ("id", "tenant_id", "key", "name", "rank", "is_system")
SELECT
  gen_random_uuid()::text,
  tenant."id",
  role_template."key",
  role_template."name",
  role_template."rank",
  true
FROM "tenants" AS tenant
CROSS JOIN (VALUES
  ('superadmin', 'Superadmin', 5),
  ('owner', 'Owner', 4),
  ('admin', 'Admin', 3),
  ('manager', 'Manager', 2),
  ('cashier', 'Kasir', 1),
  ('staff', 'Staf', 0)
) AS role_template("key", "name", "rank")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_key", "effect")
SELECT access_role."id", permission."key", 'allow'
FROM "roles" AS access_role
CROSS JOIN "permissions" AS permission
WHERE
  access_role."key" IN ('owner', 'superadmin')
  OR (access_role."key" = 'admin' AND permission."key" NOT IN ('finance:read', 'finance:write'))
  OR (access_role."key" = 'manager' AND permission."key" IN (
    'inventory:read', 'inventory:write', 'purchasing:read', 'purchasing:write',
    'pos:read', 'pos:write', 'finance:read', 'ai:use', 'notifications:read', 'outlets:read'
  ))
  OR (access_role."key" = 'cashier' AND permission."key" IN ('pos:read', 'pos:write', 'notifications:read'))
  OR (access_role."key" = 'staff' AND permission."key" IN ('inventory:read', 'notifications:read', 'outlets:read'))
ON CONFLICT ("role_id", "permission_key") DO NOTHING;

UPDATE "users" AS user_row
SET "role_id" = access_role."id"
FROM "roles" AS access_role
WHERE access_role."tenant_id" = user_row."tenant_id"
  AND access_role."key" = user_row."role"::text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill user roles: at least one user has no matching role template';
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "users"
  ADD CONSTRAINT "users_tenant_id_role_id_fkey"
  FOREIGN KEY ("tenant_id", "role_id")
  REFERENCES "roles"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
