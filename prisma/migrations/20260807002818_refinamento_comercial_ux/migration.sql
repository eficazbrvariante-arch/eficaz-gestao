-- AlterTable
ALTER TABLE "products" ADD COLUMN     "featuredOrder" INTEGER,
ADD COLUMN     "featuredUntil" TIMESTAMP(3),
ADD COLUMN     "promoStartedAt" TIMESTAMP(3),
ADD COLUMN     "promoStockLimit" INTEGER;
