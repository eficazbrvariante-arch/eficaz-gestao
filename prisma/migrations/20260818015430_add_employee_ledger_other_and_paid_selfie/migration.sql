-- AlterEnum
ALTER TYPE "EmployeeLedgerType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "employee_ledger_entries" ADD COLUMN     "paidSelfieUrl" TEXT;
