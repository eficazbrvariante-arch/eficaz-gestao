-- AlterEnum
ALTER TYPE "EmployeeLedgerType" ADD VALUE 'HOURLY_PAYMENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 0;
