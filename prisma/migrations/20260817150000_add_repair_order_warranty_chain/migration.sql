-- AlterTable
ALTER TABLE "repair_orders" ADD COLUMN     "warrantyOriginalId" TEXT;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_warrantyOriginalId_fkey" FOREIGN KEY ("warrantyOriginalId") REFERENCES "repair_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
