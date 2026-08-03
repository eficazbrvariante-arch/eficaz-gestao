-- CreateEnum
CREATE TYPE "RepairOrderStatus" AS ENUM ('RECEIVED', 'ANALYZING', 'AWAITING_APPROVAL', 'APPROVED', 'IN_REPAIR', 'AWAITING_PART', 'READY', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "repairOrderSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "repair_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "RepairOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "customerId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "imei" TEXT,
    "passcode" TEXT,
    "turnsOn" BOOLEAN NOT NULL DEFAULT true,
    "condition" TEXT,
    "reportedDefects" TEXT,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "internalNotes" TEXT,
    "estimatedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_order_items" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "repair_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_order_photos" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "repair_order_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_order_events" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_orders_tenantId_status_idx" ON "repair_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "repair_orders_tenantId_createdAt_idx" ON "repair_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "repair_orders_tenantId_number_key" ON "repair_orders"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_items" ADD CONSTRAINT "repair_order_items_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_photos" ADD CONSTRAINT "repair_order_photos_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_order_events" ADD CONSTRAINT "repair_order_events_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
