-- CreateTable
CREATE TABLE "sale_item_defects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "creditAmount" DECIMAL(12,2) NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_item_defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_item_defect_photos" (
    "id" TEXT NOT NULL,
    "saleItemDefectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sale_item_defect_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_item_defects_tenantId_saleId_idx" ON "sale_item_defects"("tenantId", "saleId");

-- AddForeignKey
ALTER TABLE "sale_item_defects" ADD CONSTRAINT "sale_item_defects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_defects" ADD CONSTRAINT "sale_item_defects_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_defects" ADD CONSTRAINT "sale_item_defects_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_defects" ADD CONSTRAINT "sale_item_defects_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_defect_photos" ADD CONSTRAINT "sale_item_defect_photos_saleItemDefectId_fkey" FOREIGN KEY ("saleItemDefectId") REFERENCES "sale_item_defects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
