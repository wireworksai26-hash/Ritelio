-- CreateEnum
CREATE TYPE "QcStage" AS ENUM ('incoming', 'in_process', 'final');

-- CreateEnum
CREATE TYPE "WorkCenterKind" AS ENUM ('machine', 'facility', 'labor');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('planned', 'started', 'done', 'cancelled');

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "labor_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "parent_order_id" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quality_checks" DROP COLUMN "stage",
ADD COLUMN     "stage" "QcStage" NOT NULL;

-- CreateTable
CREATE TABLE "work_centers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WorkCenterKind" NOT NULL DEFAULT 'machine',
    "capacity_per_day" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "capacity_minutes" INTEGER NOT NULL DEFAULT 480,
    "hourly_rate" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_center_id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "start_minutes" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_stage_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "stage" "QcStage" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "min_pass_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,

    CONSTRAINT "qc_stage_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_centers_tenant_id_company_id_code_key" ON "work_centers"("tenant_id", "company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_centers_tenant_id_company_id_id_key" ON "work_centers"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "production_schedules_tenant_id_company_id_scheduled_date_idx" ON "production_schedules"("tenant_id", "company_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "production_schedules_production_order_id_idx" ON "production_schedules"("production_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_schedules_work_center_id_scheduled_date_start_mi_key" ON "production_schedules"("work_center_id", "scheduled_date", "start_minutes");

-- CreateIndex
CREATE INDEX "qc_stage_configs_tenant_id_company_id_product_id_idx" ON "qc_stage_configs"("tenant_id", "company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_stage_configs_product_id_stage_key" ON "qc_stage_configs"("product_id", "stage");

-- CreateIndex
CREATE INDEX "production_orders_parent_order_id_idx" ON "production_orders"("parent_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_checks_production_order_id_stage_key" ON "quality_checks"("production_order_id", "stage");

-- AddForeignKey
ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_tenant_id_company_id_work_center_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "work_center_id") REFERENCES "work_centers"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_parent_order_id_fkey" FOREIGN KEY ("parent_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_stage_configs" ADD CONSTRAINT "qc_stage_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
