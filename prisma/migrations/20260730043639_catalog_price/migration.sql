-- AlterTable
ALTER TABLE "products" ADD COLUMN     "catalogPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_tenantId_active_showInCatalog_catalogPrice_idx" ON "products"("tenantId", "active", "showInCatalog", "catalogPrice");
