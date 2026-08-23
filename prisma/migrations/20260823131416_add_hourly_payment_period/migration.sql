-- AlterTable
ALTER TABLE "employee_ledger_entries" ADD COLUMN     "hourlyPeriodFrom" TIMESTAMP(3),
ADD COLUMN     "hourlyPeriodTo" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "employee_ledger_entries_tenantId_userId_type_hourlyPeriodTo_idx" ON "employee_ledger_entries"("tenantId", "userId", "type", "hourlyPeriodTo");
