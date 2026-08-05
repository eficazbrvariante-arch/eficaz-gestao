-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'STORE_CREDIT';

-- CreateEnum
CREATE TYPE "CreditMovementType" AS ENUM ('GRANTED', 'REDEEMED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_credit_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CreditMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "saleId" TEXT,
    "userId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_credit_movements_tenantId_customerId_createdAt_idx" ON "customer_credit_movements"("tenantId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "customer_credit_movements" ADD CONSTRAINT "customer_credit_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_movements" ADD CONSTRAINT "customer_credit_movements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_movements" ADD CONSTRAINT "customer_credit_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_movements" ADD CONSTRAINT "customer_credit_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
