-- AlterTable
ALTER TABLE "fiado_entries" ADD COLUMN     "repairOrderId" TEXT;

-- AlterTable
ALTER TABLE "repair_orders" ADD COLUMN     "deliveredById" TEXT;

-- CreateTable
CREATE TABLE "repair_order_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_order_payments_tenantId_repairOrderId_idx" ON "repair_order_payments"("tenantId", "repairOrderId");

-- CreateIndex
CREATE INDEX "repair_order_payments_tenantId_cashRegisterId_idx" ON "repair_order_payments"("tenantId", "cashRegisterId");

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_payments" ADD CONSTRAINT "repair_order_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_payments" ADD CONSTRAINT "repair_order_payments_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_payments" ADD CONSTRAINT "repair_order_payments_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_payments" ADD CONSTRAINT "repair_order_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_entries" ADD CONSTRAINT "fiado_entries_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "repair_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
