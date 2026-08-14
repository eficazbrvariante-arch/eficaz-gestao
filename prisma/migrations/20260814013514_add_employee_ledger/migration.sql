-- CreateEnum
CREATE TYPE "EmployeeLedgerType" AS ENUM ('ADVANCE', 'PURCHASE');

-- CreateEnum
CREATE TYPE "EmployeeLedgerStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "employee_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "EmployeeLedgerType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "status" "EmployeeLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_ledger_entries_tenantId_userId_status_idx" ON "employee_ledger_entries"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "employee_ledger_entries_tenantId_status_createdAt_idx" ON "employee_ledger_entries"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "employee_ledger_entries" ADD CONSTRAINT "employee_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_ledger_entries" ADD CONSTRAINT "employee_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_ledger_entries" ADD CONSTRAINT "employee_ledger_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
