-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "performedById" TEXT,
ADD COLUMN     "selfieUrl" TEXT;
-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
