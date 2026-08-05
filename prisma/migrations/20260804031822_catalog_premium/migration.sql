-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "avgRating" DECIMAL(2,1),
ADD COLUMN     "promoEndsAt" TIMESTAMP(3),
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "aboutText" TEXT,
ADD COLUMN     "acceptedPaymentMethods" "OrderPaymentMethod"[],
ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "exchangePolicy" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "maxInstallments" INTEGER,
ADD COLUMN     "minInstallmentValue" DECIMAL(10,2),
ADD COLUMN     "privacyPolicy" TEXT,
ADD COLUMN     "warrantyPolicy" TEXT;

-- CreateTable
CREATE TABLE "product_price_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "effectivePrice" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_price_history_tenantId_productId_recordedAt_idx" ON "product_price_history"("tenantId", "productId", "recordedAt");

-- CreateIndex
CREATE INDEX "product_reviews_tenantId_productId_idx" ON "product_reviews"("tenantId", "productId");

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
