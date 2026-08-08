-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "customers_resetToken_key" ON "customers"("resetToken");
