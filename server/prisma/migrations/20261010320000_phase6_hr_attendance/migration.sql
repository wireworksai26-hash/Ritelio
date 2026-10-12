-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "late_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "worked_hours" DECIMAL(6,2) NOT NULL DEFAULT 0;
