-- Crédito Eficaz × Convênio: origem do limite, motivo da alteração,
-- venda parcelada no PDV e a configuração (desligada) por convênio.
-- Nenhum dado é apagado ou alterado: tudo que existe continua com
-- `creditoEficazSource = 'MANUAL'` e `reason = 'MANUAL_ADJUSTMENT'`.
-- O índice único de `saleId` vira `[saleId, installmentNumber]` porque uma
-- venda passa a poder ter mais de uma parcela (linhas antigas, com
-- `installmentNumber` nulo, continuam válidas).

-- CreateEnum
CREATE TYPE "CreditoEficazLimitSource" AS ENUM ('MANUAL', 'CONVENIO');

-- CreateEnum
CREATE TYPE "CreditoEficazLimitChangeReason" AS ENUM ('MANUAL_ADJUSTMENT', 'APPLICATION_APPROVAL', 'CONVENIO_AUTO_GRANT', 'PUNCTUALITY_BONUS', 'BULK_ADJUSTMENT');

-- DropIndex
DROP INDEX "credito_eficaz_usages_saleId_key";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditoEficazAutoGrantedAt" TIMESTAMP(3),
ADD COLUMN     "creditoEficazSource" "CreditoEficazLimitSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "creditoEficazSourceConvenioId" TEXT;

-- AlterTable
ALTER TABLE "credito_eficaz_limit_changes" ADD COLUMN     "reason" "CreditoEficazLimitChangeReason" NOT NULL DEFAULT 'MANUAL_ADJUSTMENT',
ADD COLUMN     "sourceUsageId" TEXT;

-- CreateTable
CREATE TABLE "convenio_credit_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultLimitAmount" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "surchargePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "installmentCount" INTEGER NOT NULL DEFAULT 2,
    "installmentIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "bonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "autoLimitCap" DECIMAL(12,2) NOT NULL DEFAULT 300,
    "blockOnOverdue" BOOLEAN NOT NULL DEFAULT true,
    "campaignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "campaignDayOfMonth" INTEGER NOT NULL DEFAULT 20,
    "enabledAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convenio_credit_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "convenioId" TEXT,
    "referenceMonth" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "drawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credito_eficaz_campaign_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_eficaz_campaign_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convenio_credit_policies_convenioId_key" ON "convenio_credit_policies"("convenioId");

-- CreateIndex
CREATE INDEX "convenio_credit_policies_tenantId_enabled_idx" ON "convenio_credit_policies"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "credito_eficaz_campaigns_tenantId_convenioId_referenceMonth_key" ON "credito_eficaz_campaigns"("tenantId", "convenioId", "referenceMonth");

-- CreateIndex
CREATE INDEX "credito_eficaz_campaign_entries_tenantId_campaignId_idx" ON "credito_eficaz_campaign_entries"("tenantId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "credito_eficaz_campaign_entries_campaignId_customerId_key" ON "credito_eficaz_campaign_entries"("campaignId", "customerId");

-- CreateIndex
CREATE INDEX "customers_tenantId_creditoEficazSource_idx" ON "customers"("tenantId", "creditoEficazSource");

-- CreateIndex
CREATE INDEX "credito_eficaz_limit_changes_tenantId_reason_createdAt_idx" ON "credito_eficaz_limit_changes"("tenantId", "reason", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "credito_eficaz_limit_changes_sourceUsageId_reason_key" ON "credito_eficaz_limit_changes"("sourceUsageId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "credito_eficaz_usages_saleId_installmentNumber_key" ON "credito_eficaz_usages"("saleId", "installmentNumber");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_creditoEficazSourceConvenioId_fkey" FOREIGN KEY ("creditoEficazSourceConvenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_credit_policies" ADD CONSTRAINT "convenio_credit_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_credit_policies" ADD CONSTRAINT "convenio_credit_policies_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_credit_policies" ADD CONSTRAINT "convenio_credit_policies_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_campaigns" ADD CONSTRAINT "credito_eficaz_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_campaigns" ADD CONSTRAINT "credito_eficaz_campaigns_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_campaign_entries" ADD CONSTRAINT "credito_eficaz_campaign_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_campaign_entries" ADD CONSTRAINT "credito_eficaz_campaign_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "credito_eficaz_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_eficaz_campaign_entries" ADD CONSTRAINT "credito_eficaz_campaign_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

