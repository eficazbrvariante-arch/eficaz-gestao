-- CreateEnum
CREATE TYPE "CreditoEficazApplicationStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'INFO_REQUESTED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CreditoEficazDocumentType" AS ENUM ('ID_DOCUMENT', 'RESIDENCE_PROOF', 'SELFIE');

-- CreateEnum
CREATE TYPE "CreditoEficazUsageStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CREDITO_EFICAZ';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditoEficazAvailableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "creditoEficazBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditoEficazBlockedReason" TEXT,
ADD COLUMN     "creditoEficazLimitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "creditoEficazPinHash" TEXT,
ADD COLUMN     "creditoEficazPinSetAt" TIMESTAMP(3),
ADD COLUMN     "eficazNumber" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "customerSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credito_eficaz_applications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CreditoEficazApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "occupation" TEXT,
    "income" DECIMAL(12,2),
    "bestDueDay" INTEGER,
    "additionalNotes" TEXT,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "approvedLimitAmount" DECIMAL(12,2),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credito_eficaz_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "CreditoEficazDocumentType" NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_limit_changes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "previousLimit" DECIMAL(12,2) NOT NULL,
    "newLimit" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_limit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_usages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "availableBefore" DECIMAL(12,2) NOT NULL,
    "availableAfter" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "CreditoEficazUsageStatus" NOT NULL DEFAULT 'OPEN',
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_billings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "method" TEXT,
    "reconciliationRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "credito_eficaz_billings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credito_eficaz_applications_tenantId_status_idx" ON "credito_eficaz_applications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "credito_eficaz_applications_tenantId_customerId_idx" ON "credito_eficaz_applications"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "credito_eficaz_documents_tenantId_applicationId_idx" ON "credito_eficaz_documents"("tenantId", "applicationId");

-- CreateIndex
CREATE INDEX "credito_eficaz_limit_changes_tenantId_customerId_createdAt_idx" ON "credito_eficaz_limit_changes"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "credito_eficaz_usages_saleId_key" ON "credito_eficaz_usages"("saleId");

-- CreateIndex
CREATE INDEX "credito_eficaz_usages_tenantId_customerId_createdAt_idx" ON "credito_eficaz_usages"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "credito_eficaz_usages_tenantId_status_dueDate_idx" ON "credito_eficaz_usages"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "credito_eficaz_payments_tenantId_usageId_idx" ON "credito_eficaz_payments"("tenantId", "usageId");

-- CreateIndex
CREATE INDEX "credito_eficaz_billings_tenantId_usageId_idx" ON "credito_eficaz_billings"("tenantId", "usageId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_eficazNumber_key" ON "customers"("eficazNumber");

-- AddForeignKey
ALTER TABLE "credito_eficaz_applications" ADD CONSTRAINT "credito_eficaz_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_applications" ADD CONSTRAINT "credito_eficaz_applications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_applications" ADD CONSTRAINT "credito_eficaz_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_documents" ADD CONSTRAINT "credito_eficaz_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_documents" ADD CONSTRAINT "credito_eficaz_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "credito_eficaz_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_limit_changes" ADD CONSTRAINT "credito_eficaz_limit_changes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_limit_changes" ADD CONSTRAINT "credito_eficaz_limit_changes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_limit_changes" ADD CONSTRAINT "credito_eficaz_limit_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_usages" ADD CONSTRAINT "credito_eficaz_usages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_usages" ADD CONSTRAINT "credito_eficaz_usages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_usages" ADD CONSTRAINT "credito_eficaz_usages_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_usages" ADD CONSTRAINT "credito_eficaz_usages_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_payments" ADD CONSTRAINT "credito_eficaz_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_payments" ADD CONSTRAINT "credito_eficaz_payments_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "credito_eficaz_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_payments" ADD CONSTRAINT "credito_eficaz_payments_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_billings" ADD CONSTRAINT "credito_eficaz_billings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_billings" ADD CONSTRAINT "credito_eficaz_billings_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "credito_eficaz_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
