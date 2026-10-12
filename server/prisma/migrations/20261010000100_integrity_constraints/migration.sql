-- Refuse to silently rewrite historical references. If any check fails, inspect
-- the affected rows and decide explicitly how to repair before retrying.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "product_categories" AS child
    WHERE child."parent_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "product_categories" AS parent
        WHERE parent."id" = child."parent_id"
          AND parent."tenant_id" = child."tenant_id"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot add category parent FK: orphan or cross-tenant parent_id exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ai_insights_log" AS log
    WHERE log."user_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "users" AS user_row
        WHERE user_row."id" = log."user_id"
          AND user_row."tenant_id" = log."tenant_id"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot add insight user FK: orphan or cross-tenant user_id exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "audit_logs" AS log
    WHERE log."user_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "users" AS user_row
        WHERE user_row."id" = log."user_id"
          AND user_row."tenant_id" = log."tenant_id"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot add audit user FK: orphan or cross-tenant user_id exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "notifications" AS notification
    WHERE notification."user_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "users" AS user_row
        WHERE user_row."id" = notification."user_id"
          AND user_row."tenant_id" = notification."tenant_id"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot add notification user FK: orphan or cross-tenant user_id exists';
  END IF;
END $$;

-- DropIndex
DROP INDEX "inventory_stock_product_id_warehouse_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_tenant_id_product_id_warehouse_id_key" ON "inventory_stock"("tenant_id", "product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_ref_id_idx" ON "stock_movements"("tenant_id", "ref_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_po_id_idx" ON "purchase_order_items"("po_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

-- CreateIndex
CREATE INDEX "sales_transaction_items_transaction_id_idx" ON "sales_transaction_items"("transaction_id");

-- CreateIndex
CREATE INDEX "sales_transaction_items_product_id_idx" ON "sales_transaction_items"("product_id");

-- CreateIndex
CREATE INDEX "financial_entries_tenant_id_source_module_source_ref_id_idx" ON "financial_entries"("tenant_id", "source_module", "source_ref_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_entity_id_idx" ON "audit_logs"("tenant_id", "entity", "entity_id");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights_log" ADD CONSTRAINT "ai_insights_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
