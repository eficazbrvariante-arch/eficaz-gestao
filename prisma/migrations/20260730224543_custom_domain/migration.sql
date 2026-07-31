/*
  Warnings:

  - The `domainStatus` column on the `tenants` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'ACTIVE');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "domainCheckedAt" TIMESTAMP(3),
ADD COLUMN     "domainToken" TEXT,
ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3),
DROP COLUMN "domainStatus",
ADD COLUMN     "domainStatus" "DomainStatus" NOT NULL DEFAULT 'NONE';
