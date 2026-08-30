-- AlterTable
ALTER TABLE "credito_eficaz_applications" ADD COLUMN     "wave" TEXT;

-- AlterTable
ALTER TABLE "credito_eficaz_usages" ADD COLUMN     "financingId" TEXT,
ADD COLUMN     "installmentCount" INTEGER,
ADD COLUMN     "installmentNumber" INTEGER,
ALTER COLUMN "saleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "creditoEficazExposureLimit" DECIMAL(12,2),
ADD COLUMN     "creditoEficazMaxInstallments" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "creditoEficazPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "credito_eficaz_service_financings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "downPayment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "financedAmount" DECIMAL(12,2) NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "wouldBeLostWithoutCredit" BOOLEAN,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_service_financings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credito_eficaz_service_financings_repairOrderId_key" ON "credito_eficaz_service_financings"("repairOrderId");

-- CreateIndex
CREATE INDEX "credito_eficaz_service_financings_tenantId_createdAt_idx" ON "credito_eficaz_service_financings"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "credito_eficaz_usages_tenantId_financingId_idx" ON "credito_eficaz_usages"("tenantId", "financingId");

-- AddForeignKey
ALTER TABLE "credito_eficaz_usages" ADD CONSTRAINT "credito_eficaz_usages_financingId_fkey" FOREIGN KEY ("financingId") REFERENCES "credito_eficaz_service_financings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_service_financings" ADD CONSTRAINT "credito_eficaz_service_financings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_service_financings" ADD CONSTRAINT "credito_eficaz_service_financings_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_service_financings" ADD CONSTRAINT "credito_eficaz_service_financings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_service_financings" ADD CONSTRAINT "credito_eficaz_service_financings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
