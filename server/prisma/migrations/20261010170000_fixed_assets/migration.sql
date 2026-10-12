-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('straight_line', 'declining_balance');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('active', 'fully_depreciated', 'disposed');

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "acquisition_date" DATE NOT NULL,
    "acquisition_cost" DECIMAL(18,2) NOT NULL,
    "salvage_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "depreciation_method" "DepreciationMethod" NOT NULL DEFAULT 'straight_line',
    "declining_rate" DECIMAL(9,6),
    "accumulated_depreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "AssetStatus" NOT NULL DEFAULT 'active',
    "disposed_at" TIMESTAMP(3),
    "disposal_proceeds" DECIMAL(18,2),
    "journal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "depreciation" DECIMAL(18,2) NOT NULL,
    "accumulated" DECIMAL(18,2) NOT NULL,
    "book_value" DECIMAL(18,2) NOT NULL,
    "journal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixed_assets_tenant_id_company_id_status_idx" ON "fixed_assets"("tenant_id", "company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_tenant_id_company_id_code_key" ON "fixed_assets"("tenant_id", "company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_tenant_id_company_id_id_key" ON "fixed_assets"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "depreciation_schedules_tenant_id_company_id_period_id_idx" ON "depreciation_schedules"("tenant_id", "company_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_schedules_asset_id_period_id_key" ON "depreciation_schedules"("asset_id", "period_id");

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_tenant_id_company_id_journal_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "journal_id") REFERENCES "journal_headers"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_tenant_id_company_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "asset_id") REFERENCES "fixed_assets"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_tenant_id_company_id_period_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "period_id") REFERENCES "fiscal_periods"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_tenant_id_company_id_journal_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "journal_id") REFERENCES "journal_headers"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
