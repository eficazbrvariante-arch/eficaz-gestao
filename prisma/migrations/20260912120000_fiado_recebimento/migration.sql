-- AlterTable
ALTER TABLE "fiado_entries" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "paidCashRegisterId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod";
-- CreateIndex
CREATE INDEX "fiado_entries_paidCashRegisterId_idx" ON "fiado_entries"("paidCashRegisterId");
-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_paidCashRegisterId_fkey" FOREIGN KEY ("paidCashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: fiado já pago antes deste campo existir fica com a última
-- alteração como data de pagamento (é quando foi marcado como pago).
UPDATE "fiado_entries" SET "paidAt" = "updatedAt" WHERE "status" = 'PAID' AND "paidAt" IS NULL;
