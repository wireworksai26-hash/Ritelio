-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "qty_rejected" DECIMAL(14,2) NOT NULL DEFAULT 0;
