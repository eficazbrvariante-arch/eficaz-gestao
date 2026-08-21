-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "commissionFixedAmount" DECIMAL(10,2),
ADD COLUMN     "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENT';
