BEGIN;

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "sales_transactions" DROP CONSTRAINT "sales_transactions_customer_id_fkey";

-- DropIndex
DROP INDEX "customers_tenant_id_idx";

-- DropIndex
DROP INDEX "suppliers_tenant_id_idx";

-- Tambah kolom nullable dulu supaya data lama bisa di-backfill ke Company MAIN.
ALTER TABLE "customers" ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN "code" TEXT,
ADD COLUMN "company_id" TEXT,
ADD COLUMN "credit_limit" DECIMAL(18,2),
ADD COLUMN "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "payment_term_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN "tax_id" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3);

ALTER TABLE "suppliers" ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN "code" TEXT,
ADD COLUMN "company_id" TEXT,
ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "credit_limit" DECIMAL(18,2),
ADD COLUMN "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "payment_term_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN "tax_id" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3);

-- Backfill company_id ke Company MAIN milik tenant yang sama.
UPDATE "customers" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

UPDATE "suppliers" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

-- Nomor kode legacy mengikuti urutan nama agar stabil dan mudah dibaca.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "name", "id") AS rn
  FROM "customers"
)
UPDATE "customers" AS target
SET "code" = 'CUST-' || LPAD(ranked.rn::TEXT, 5, '0')
FROM ranked
WHERE ranked."id" = target."id" AND target."code" IS NULL;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "name", "id") AS rn
  FROM "suppliers"
)
UPDATE "suppliers" AS target
SET "code" = 'SUPP-' || LPAD(ranked.rn::TEXT, 5, '0')
FROM ranked
WHERE ranked."id" = target."id" AND target."code" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "customers" WHERE "company_id" IS NULL OR "code" IS NULL)
     OR EXISTS (SELECT 1 FROM "suppliers" WHERE "company_id" IS NULL OR "code" IS NULL) THEN
    RAISE EXCEPTION 'Cannot scope legacy parties: at least one tenant has no MAIN company';
  END IF;
END $$;

UPDATE "customers" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
UPDATE "suppliers" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "customers" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "customers_tenant_id_company_id_is_active_idx" ON "customers"("tenant_id", "company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_company_id_code_key" ON "customers"("tenant_id", "company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_company_id_id_key" ON "customers"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_company_id_is_active_idx" ON "suppliers"("tenant_id", "company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_company_id_code_key" ON "suppliers"("tenant_id", "company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_company_id_id_key" ON "suppliers"("tenant_id", "company_id", "id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_company_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_tenant_id_company_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "customer_id") REFERENCES "customers"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;