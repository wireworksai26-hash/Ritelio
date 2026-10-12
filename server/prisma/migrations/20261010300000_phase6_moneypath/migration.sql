-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "billed_at" TIMESTAMP(3),
ADD COLUMN     "billed_invoice_id" TEXT;

-- CreateIndex
CREATE INDEX "timesheets_tenant_id_project_id_billed_at_idx" ON "timesheets"("tenant_id", "project_id", "billed_at");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_billed_invoice_id_fkey" FOREIGN KEY ("billed_invoice_id") REFERENCES "customer_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
