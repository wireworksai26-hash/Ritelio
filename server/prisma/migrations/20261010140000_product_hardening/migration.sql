-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('goods', 'raw_material', 'semi_finished', 'service');

-- AlterTable
ALTER TABLE "inventory_stock" ADD COLUMN     "avg_cost" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "product_type" "ProductType" NOT NULL DEFAULT 'goods',
ADD COLUMN     "updated_at" TIMESTAMP(3);

-- Backfill updated_at dari created_at sebelum ditegakkan NOT NULL.
UPDATE "products" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "products" ALTER COLUMN "updated_at" SET NOT NULL;

-- Stok lama mulai dari HPP master, supaya COGS tidak bernilai 0.
UPDATE "inventory_stock" AS stock
SET "avg_cost" = product."cost_price"
FROM "products" AS product
WHERE product."id" = stock."product_id";

-- CreateIndex
CREATE INDEX "products_tenant_id_is_active_idx" ON "products"("tenant_id", "is_active");

-- Barcode wajib unik per tenant saat diisi (produk tanpa barcode tetap boleh banyak).
CREATE UNIQUE INDEX "products_tenant_id_barcode_key"
  ON "products"("tenant_id", "barcode")
  WHERE "barcode" IS NOT NULL AND "barcode" <> '';