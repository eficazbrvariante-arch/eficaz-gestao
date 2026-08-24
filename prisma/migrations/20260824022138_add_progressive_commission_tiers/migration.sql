-- CreateTable
CREATE TABLE "commission_tier_sets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_tier_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_tiers" (
    "id" TEXT NOT NULL,
    "tierSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "minAmount" DECIMAL(12,2) NOT NULL,
    "maxAmount" DECIMAL(12,2),
    "percent" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "commission_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_monthly_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "totalSales" DECIMAL(12,2) NOT NULL,
    "totalCommission" DECIMAL(12,2) NOT NULL,
    "tierBreakdown" JSONB NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_tier_sets_tenantId_validFrom_idx" ON "commission_tier_sets"("tenantId", "validFrom");

-- CreateIndex
CREATE INDEX "commission_tiers_tierSetId_order_idx" ON "commission_tiers"("tierSetId", "order");

-- CreateIndex
CREATE INDEX "commission_monthly_snapshots_tenantId_month_idx" ON "commission_monthly_snapshots"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "commission_monthly_snapshots_tenantId_userId_month_key" ON "commission_monthly_snapshots"("tenantId", "userId", "month");

-- AddForeignKey
ALTER TABLE "commission_tier_sets" ADD CONSTRAINT "commission_tier_sets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_tier_sets" ADD CONSTRAINT "commission_tier_sets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_tiers" ADD CONSTRAINT "commission_tiers_tierSetId_fkey" FOREIGN KEY ("tierSetId") REFERENCES "commission_tier_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_monthly_snapshots" ADD CONSTRAINT "commission_monthly_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_monthly_snapshots" ADD CONSTRAINT "commission_monthly_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_monthly_snapshots" ADD CONSTRAINT "commission_monthly_snapshots_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
