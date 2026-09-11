-- AlterEnum
ALTER TYPE "CreditoEficazDocumentType" ADD VALUE 'EMPLOYMENT_PROOF';

-- AlterTable
ALTER TABLE "credito_eficaz_applications" ADD COLUMN     "workplaceAddress" TEXT,
ADD COLUMN     "workplaceName" TEXT,
ADD COLUMN     "workplaceTenure" TEXT;
