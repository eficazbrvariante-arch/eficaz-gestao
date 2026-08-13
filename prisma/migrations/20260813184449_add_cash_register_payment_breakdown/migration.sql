-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "countedCreditAmount" DECIMAL(12,2),
ADD COLUMN     "countedDebitAmount" DECIMAL(12,2),
ADD COLUMN     "countedPixAmount" DECIMAL(12,2),
ADD COLUMN     "expectedCreditAmount" DECIMAL(12,2),
ADD COLUMN     "expectedDebitAmount" DECIMAL(12,2),
ADD COLUMN     "expectedPixAmount" DECIMAL(12,2);
