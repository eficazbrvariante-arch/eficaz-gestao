-- AlterTable
ALTER TABLE "convenio_members" ADD COLUMN     "credentialTokenHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "convenioDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "convenio_redemptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "benefitAmount" DECIMAL(10,2) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convenio_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convenio_members_credentialTokenHash_key" ON "convenio_members"("credentialTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "convenio_redemptions_saleId_key" ON "convenio_redemptions"("saleId");

-- CreateIndex
CREATE INDEX "convenio_redemptions_tenantId_convenioId_createdAt_idx" ON "convenio_redemptions"("tenantId", "convenioId", "createdAt");

-- CreateIndex
CREATE INDEX "convenio_redemptions_memberId_createdAt_idx" ON "convenio_redemptions"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "convenio_redemptions" ADD CONSTRAINT "convenio_redemptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_redemptions" ADD CONSTRAINT "convenio_redemptions_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_redemptions" ADD CONSTRAINT "convenio_redemptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "convenio_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_redemptions" ADD CONSTRAINT "convenio_redemptions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_redemptions" ADD CONSTRAINT "convenio_redemptions_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
