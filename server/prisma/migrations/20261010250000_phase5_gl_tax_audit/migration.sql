-- CreateEnum
CREATE TYPE "TaxDirection" AS ENUM ('output', 'input');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'success',
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "user_agent" TEXT;

-- AlterTable
ALTER TABLE "customer_invoices" ADD COLUMN     "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tax_computations" ADD COLUMN     "direction" "TaxDirection" NOT NULL DEFAULT 'output';

-- AlterTable
ALTER TABLE "tax_rules" ADD COLUMN     "direction" "TaxDirection" NOT NULL DEFAULT 'output';

-- AlterTable
ALTER TABLE "vendor_bills" ADD COLUMN     "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_user_id_created_at_idx" ON "audit_logs"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_action_created_at_idx" ON "audit_logs"("tenant_id", "action", "created_at");
