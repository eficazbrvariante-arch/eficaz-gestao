-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
