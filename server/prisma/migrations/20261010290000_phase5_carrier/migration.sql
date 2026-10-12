-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "carrier_name" TEXT,
ADD COLUMN     "carrier_tracking_number" TEXT,
ADD COLUMN     "carrier_webhook_secret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shipments_carrier_tracking_number_key" ON "shipments"("carrier_tracking_number");
