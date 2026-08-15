-- AlterTable: referência direta e opcional, sem backfill (nula pra todo cliente já existente).
ALTER TABLE "customers" ADD COLUMN     "convenioMemberId" TEXT;

-- CreateTable
CREATE TABLE "convenio_product_discounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convenio_product_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_convenioMemberId_key" ON "customers"("convenioMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "convenio_product_discounts_convenioId_productId_key" ON "convenio_product_discounts"("convenioId", "productId");

-- CreateIndex
CREATE INDEX "convenio_product_discounts_tenantId_convenioId_idx" ON "convenio_product_discounts"("tenantId", "convenioId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_convenioMemberId_fkey" FOREIGN KEY ("convenioMemberId") REFERENCES "convenio_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_product_discounts" ADD CONSTRAINT "convenio_product_discounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_product_discounts" ADD CONSTRAINT "convenio_product_discounts_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_product_discounts" ADD CONSTRAINT "convenio_product_discounts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
