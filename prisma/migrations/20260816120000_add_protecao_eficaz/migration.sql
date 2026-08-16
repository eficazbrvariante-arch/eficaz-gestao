-- CreateEnum
CREATE TYPE "ProtecaoEficazStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "protecaoEficazOptedIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "protecao_eficaz" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleNumber" INTEGER NOT NULL,
    "proofPhotoUrl" TEXT NOT NULL,
    "status" "ProtecaoEficazStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "protectionExpiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protecao_eficaz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protecao_eficaz_tenantId_status_idx" ON "protecao_eficaz"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "protecao_eficaz_tenantId_saleNumber_key" ON "protecao_eficaz"("tenantId", "saleNumber");

-- AddForeignKey
ALTER TABLE "protecao_eficaz" ADD CONSTRAINT "protecao_eficaz_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protecao_eficaz" ADD CONSTRAINT "protecao_eficaz_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protecao_eficaz" ADD CONSTRAINT "protecao_eficaz_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protecao_eficaz" ADD CONSTRAINT "protecao_eficaz_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

