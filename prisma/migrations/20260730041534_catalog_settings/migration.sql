-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "bannerSubtitle" TEXT,
ADD COLUMN     "bannerTitle" TEXT,
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "catalogEnabled" BOOLEAN NOT NULL DEFAULT true;
