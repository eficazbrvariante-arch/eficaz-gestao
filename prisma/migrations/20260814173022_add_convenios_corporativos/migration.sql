-- CreateEnum
CREATE TYPE "ConvenioMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "convenios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "responsibleName" TEXT,
    "responsiblePhone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convenios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convenio_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "selfieUrl" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "status" "ConvenioMemberStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "statusChangedById" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convenio_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convenios_tenantId_slug_key" ON "convenios"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "convenio_members_tenantId_convenioId_status_idx" ON "convenio_members"("tenantId", "convenioId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "convenio_members_convenioId_document_key" ON "convenio_members"("convenioId", "document");

-- AddForeignKey
ALTER TABLE "convenios" ADD CONSTRAINT "convenios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_members" ADD CONSTRAINT "convenio_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_members" ADD CONSTRAINT "convenio_members_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_members" ADD CONSTRAINT "convenio_members_statusChangedById_fkey" FOREIGN KEY ("statusChangedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
