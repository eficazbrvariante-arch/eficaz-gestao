-- CreateEnum
CREATE TYPE "AttendanceEntryType" AS ENUM ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "assistantSellerId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "attendanceSettings" JSONB;

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AttendanceEntryType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selfieUrl" TEXT,
    "selfieWaived" BOOLEAN NOT NULL DEFAULT false,
    "selfieWaivedById" TEXT,
    "selfieWaivedReason" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "correctedById" TEXT NOT NULL,
    "originalType" "AttendanceEntryType" NOT NULL,
    "originalOccurredAt" TIMESTAMP(3) NOT NULL,
    "newType" "AttendanceEntryType" NOT NULL,
    "newOccurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_entries_tenantId_userId_occurredAt_idx" ON "attendance_entries"("tenantId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "attendance_entries_tenantId_occurredAt_idx" ON "attendance_entries"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenantId_entryId_createdAt_idx" ON "attendance_corrections"("tenantId", "entryId", "createdAt");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenantId_createdAt_idx" ON "attendance_corrections"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_selfieWaivedById_fkey" FOREIGN KEY ("selfieWaivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "attendance_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_assistantSellerId_fkey" FOREIGN KEY ("assistantSellerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
