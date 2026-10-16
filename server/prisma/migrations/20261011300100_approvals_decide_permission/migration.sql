-- Izin baru approvals:decide: memutuskan tahap approval tanpa finance:write.
-- Backfill untuk tenant yang sudah ada (tenant baru memakai ensureTenantRoles).
INSERT INTO "permissions" ("key", "module", "action", "description")
VALUES ('approvals:decide', 'approvals', 'decide', 'approvals decide')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_key", "effect")
SELECT r."id", 'approvals:decide', 'allow'
FROM "roles" r
WHERE r."key" IN ('owner', 'superadmin', 'manager')
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
