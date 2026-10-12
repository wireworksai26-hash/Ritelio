-- CreateEnum
CREATE TYPE "StockOpStatus" AS ENUM ('open', 'closed');

-- DropIndex
DROP INDEX "warehouses_tenant_id_idx";

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "code" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3);

-- Backfill kode gudang lama sebelum ditegakkan NOT NULL.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "name", "id") AS rn
  FROM "warehouses"
)
UPDATE "warehouses" AS target
SET "code" = 'WH-' || LPAD(ranked.rn::TEXT, 4, '0')
FROM ranked
WHERE ranked."id" = target."id" AND target."code" IS NULL;

UPDATE "warehouses" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "warehouses" WHERE "code" IS NULL) THEN
    RAISE EXCEPTION 'Cannot generate warehouse codes';
  END IF;
END $$;

ALTER TABLE "warehouses" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "warehouses" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateTable
CREATE TABLE "stock_ops" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "StockOpStatus" NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL DEFAULT '',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "stock_ops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_op_lines" (
    "id" TEXT NOT NULL,
    "stock_op_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "system_qty" DECIMAL(14,2) NOT NULL,
    "counted_qty" DECIMAL(14,2),
    "variance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "stock_op_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_ops_tenant_id_warehouse_id_status_idx" ON "stock_ops"("tenant_id", "warehouse_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ops_tenant_id_company_id_code_key" ON "stock_ops"("tenant_id", "company_id", "code");

-- CreateIndex
CREATE INDEX "stock_op_lines_stock_op_id_idx" ON "stock_op_lines"("stock_op_id");

-- Hanya satu stock op OPEN per gudang. Partial unique tidak bisa deklarasi di
-- Prisma schema, jadi dibuat manual di sini.
CREATE UNIQUE INDEX "stock_ops_one_open_per_warehouse" ON "stock_ops"("tenant_id", "warehouse_id") WHERE "status" = 'open';

-- CreateIndex
CREATE UNIQUE INDEX "stock_op_lines_stock_op_id_product_id_key" ON "stock_op_lines"("stock_op_id", "product_id");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_company_id_is_active_idx" ON "warehouses"("tenant_id", "company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_company_id_code_key" ON "warehouses"("tenant_id", "company_id", "code");

-- AddForeignKey
ALTER TABLE "stock_ops" ADD CONSTRAINT "stock_ops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ops" ADD CONSTRAINT "stock_ops_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ops" ADD CONSTRAINT "stock_ops_tenant_id_company_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_op_lines" ADD CONSTRAINT "stock_op_lines_stock_op_id_fkey" FOREIGN KEY ("stock_op_id") REFERENCES "stock_ops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_op_lines" ADD CONSTRAINT "stock_op_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

