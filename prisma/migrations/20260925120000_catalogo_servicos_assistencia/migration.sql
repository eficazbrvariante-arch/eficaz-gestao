-- AlterTable
ALTER TABLE "repair_order_items" ADD COLUMN     "repairServiceId" TEXT,
ADD COLUMN     "unitCost" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "repair_services" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "costPrice" DECIMAL(10,2),
    "supplierId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_services_tenantId_active_idx" ON "repair_services"("tenantId", "active");

-- AddForeignKey
ALTER TABLE "repair_order_items" ADD CONSTRAINT "repair_order_items_repairServiceId_fkey" FOREIGN KEY ("repairServiceId") REFERENCES "repair_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_services" ADD CONSTRAINT "repair_services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_services" ADD CONSTRAINT "repair_services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

