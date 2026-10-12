-- AlterEnum
ALTER TYPE "QuotationStatus" ADD VALUE 'converted';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lost_at" TIMESTAMP(3);
