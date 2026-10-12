BEGIN;

BEGIN;

-- DropForeignKey
ALTER TABLE "inventory_stock" DROP CONSTRAINT "inventory_stock_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_warehouse_id_fkey";

-- DropIndex
DROP INDEX "inventory_stock_tenant_id_product_id_warehouse_id_key";

-- DropIndex
DROP INDEX "purchase_orders_tenant_id_code_key";

-- DropIndex
DROP INDEX "sales_transactions_tenant_id_client_generated_id_key";

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "inventory_stock" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "sales_transactions" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "company_id" TEXT;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN "company_id" TEXT;

-- Backfill all existing transaction and stock rows to the tenant's MAIN
-- company before enforcing non-null company scope.
UPDATE "warehouses" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

UPDATE "inventory_stock" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

UPDATE "stock_movements" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

UPDATE "purchase_orders" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

UPDATE "sales_transactions" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

UPDATE "financial_entries" AS target
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = target."tenant_id" AND company."code" = 'MAIN';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "warehouses" WHERE "company_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "inventory_stock" WHERE "company_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "stock_movements" WHERE "company_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "purchase_orders" WHERE "company_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "sales_transactions" WHERE "company_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "financial_entries" WHERE "company_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot scope legacy rows: at least one tenant has no MAIN company';
  END IF;
END $$;

ALTER TABLE "warehouses" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "inventory_stock" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "stock_movements" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "sales_transactions" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "financial_entries" ALTER COLUMN "company_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_tenant_id_company_id_product_id_warehouse_i_key" ON "inventory_stock"("tenant_id", "company_id", "product_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_company_id_code_key" ON "purchase_orders"("tenant_id", "company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_transactions_tenant_id_company_id_client_generated_id_key" ON "sales_transactions"("tenant_id", "company_id", "client_generated_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_company_id_id_key" ON "warehouses"("tenant_id", "company_id", "id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_tenant_id_company_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_company_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_company_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_tenant_id_company_id_debit_account_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "debit_account_id") REFERENCES "chart_of_accounts"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_tenant_id_company_id_credit_account_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "credit_account_id") REFERENCES "chart_of_accounts"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

COMMIT;
