-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "creditoEficazSurchargePercent" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "creditoEficazSurcharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "credito_eficaz_service_financings" ADD COLUMN     "surchargeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
