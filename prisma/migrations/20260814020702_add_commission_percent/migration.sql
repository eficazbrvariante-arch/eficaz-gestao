-- AlterTable
ALTER TABLE "products" ADD COLUMN     "commissionPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "defaultCommissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
