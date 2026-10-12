-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('vat', 'withholding', 'other');

-- CreateEnum
CREATE TYPE "TaxRuleSource" AS ENUM ('official', 'estimate');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TaxCategory" NOT NULL,
    "basis_type" TEXT NOT NULL,
    "rate" DECIMAL(9,6),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "source_ref" TEXT,
    "source" "TaxRuleSource" NOT NULL DEFAULT 'estimate',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_brackets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tax_rule_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "lower_bound" DECIMAL(14,2) NOT NULL,
    "upper_bound" DECIMAL(14,2),
    "rate_percent" DECIMAL(9,6) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "tax_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_computations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tax_rule_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "source" "TaxRuleSource" NOT NULL,
    "rule_snapshot" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_computations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_role_id" TEXT,
    "required_permission" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "acted_by_id" TEXT,
    "acted_at" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rules_tenant_id_company_id_code_effective_from_idx" ON "tax_rules"("tenant_id", "company_id", "code", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_company_id_code_effective_from_key" ON "tax_rules"("company_id", "code", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_tenant_id_company_id_id_key" ON "tax_rules"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "tax_brackets_tenant_id_company_id_tax_rule_id_lower_bound_idx" ON "tax_brackets"("tenant_id", "company_id", "tax_rule_id", "lower_bound");

-- CreateIndex
CREATE UNIQUE INDEX "tax_brackets_tax_rule_id_sort_order_effective_from_key" ON "tax_brackets"("tax_rule_id", "sort_order", "effective_from");

-- CreateIndex
CREATE INDEX "tax_computations_tenant_id_company_id_document_type_documen_idx" ON "tax_computations"("tenant_id", "company_id", "document_type", "document_id");

-- CreateIndex
CREATE INDEX "tax_computations_tenant_id_company_id_computed_at_idx" ON "tax_computations"("tenant_id", "company_id", "computed_at");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_company_id_status_submitted_at_idx" ON "approval_requests"("tenant_id", "company_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_company_id_document_type_docume_idx" ON "approval_requests"("tenant_id", "company_id", "document_type", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_tenant_id_company_id_id_key" ON "approval_requests"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "approval_steps_tenant_id_company_id_status_idx" ON "approval_steps"("tenant_id", "company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_request_id_step_order_key" ON "approval_steps"("request_id", "step_order");

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_brackets" ADD CONSTRAINT "tax_brackets_tenant_id_company_id_tax_rule_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "tax_rule_id") REFERENCES "tax_rules"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_computations" ADD CONSTRAINT "tax_computations_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_computations" ADD CONSTRAINT "tax_computations_tenant_id_company_id_tax_rule_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "tax_rule_id") REFERENCES "tax_rules"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_tenant_id_company_id_request_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "request_id") REFERENCES "approval_requests"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
