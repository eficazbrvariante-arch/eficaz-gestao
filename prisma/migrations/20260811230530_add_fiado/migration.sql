-- CreateEnum
CREATE TYPE "FiadoStatus" AS ENUM ('PENDING', 'PAID');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'FIADO';

-- CreateTable
CREATE TABLE "fiado_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "FiadoStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "saleId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiado_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiado_entries_tenantId_customerId_createdAt_idx" ON "fiado_entries"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "fiado_entries_tenantId_status_dueDate_idx" ON "fiado_entries"("tenantId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
