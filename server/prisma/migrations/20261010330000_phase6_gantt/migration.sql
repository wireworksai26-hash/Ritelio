-- DropIndex
DROP INDEX "project_milestones_project_id_idx";

-- AlterTable
ALTER TABLE "project_milestones" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "start_date" DATE,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "milestone_dependencies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "depends_on_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestone_dependencies_tenant_id_company_id_project_id_idx" ON "milestone_dependencies"("tenant_id", "company_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_dependencies_milestone_id_depends_on_id_key" ON "milestone_dependencies"("milestone_id", "depends_on_id");

-- CreateIndex
CREATE INDEX "project_milestones_tenant_id_company_id_project_id_idx" ON "project_milestones"("tenant_id", "company_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_milestones_tenant_id_company_id_id_key" ON "project_milestones"("tenant_id", "company_id", "id");

-- AddForeignKey
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "milestone_dependencies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "milestone_dependencies_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "milestone_dependencies_tenant_id_company_id_milestone_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "milestone_id") REFERENCES "project_milestones"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "milestone_dependencies_tenant_id_company_id_depends_on_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "depends_on_id") REFERENCES "project_milestones"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
