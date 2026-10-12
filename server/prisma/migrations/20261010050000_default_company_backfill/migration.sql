-- Ensure every existing tenant has the base currency and a main accounting
-- company. Fresh registrations and seeds create these records through Prisma.
INSERT INTO "currencies" ("code", "name", "symbol", "decimal_places")
VALUES ('IDR', 'Indonesian Rupiah', 'Rp', 0)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "companies" (
  "id",
  "tenant_id",
  "code",
  "name",
  "legal_name",
  "country_code",
  "default_currency_code",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  tenant."id",
  'MAIN',
  tenant."name",
  tenant."name",
  'ID',
  'IDR',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" AS tenant
WHERE NOT EXISTS (
  SELECT 1 FROM "companies" AS company
  WHERE company."tenant_id" = tenant."id"
    AND company."code" = 'MAIN'
);
