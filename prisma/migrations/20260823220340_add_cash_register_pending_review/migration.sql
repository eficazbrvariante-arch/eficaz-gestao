-- AlterEnum
ALTER TYPE "CashRegisterStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "receiptPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reviewSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "reviewSubmittedById" TEXT;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_reviewSubmittedById_fkey" FOREIGN KEY ("reviewSubmittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
