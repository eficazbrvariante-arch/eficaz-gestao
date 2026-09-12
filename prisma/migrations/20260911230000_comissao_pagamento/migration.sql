-- AlterEnum
ALTER TYPE "EmployeeLedgerType" ADD VALUE 'COMMISSION_PAYMENT';
-- AlterTable
ALTER TABLE "employee_ledger_entries" ADD COLUMN     "commissionPeriodFrom" TIMESTAMP(3),
ADD COLUMN     "commissionPeriodTo" TIMESTAMP(3);
-- CreateTable
CREATE TABLE "commission_payment_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commission_payment_sales_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "commission_payment_sales_saleId_key" ON "commission_payment_sales"("saleId");
-- CreateIndex
CREATE INDEX "commission_payment_sales_tenantId_userId_idx" ON "commission_payment_sales"("tenantId", "userId");
-- CreateIndex
CREATE INDEX "commission_payment_sales_entryId_idx" ON "commission_payment_sales"("entryId");
-- AddForeignKey
ALTER TABLE "commission_payment_sales" ADD CONSTRAINT "commission_payment_sales_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "employee_ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "commission_payment_sales" ADD CONSTRAINT "commission_payment_sales_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
