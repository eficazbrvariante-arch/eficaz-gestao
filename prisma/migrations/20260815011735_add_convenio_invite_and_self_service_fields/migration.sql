-- AlterTable
ALTER TABLE "convenio_members" ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3),
ALTER COLUMN "proofUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "convenio_invites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convenio_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convenio_invites_tokenHash_key" ON "convenio_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "convenio_invites_tenantId_convenioId_idx" ON "convenio_invites"("tenantId", "convenioId");

-- AddForeignKey
ALTER TABLE "convenio_invites" ADD CONSTRAINT "convenio_invites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_invites" ADD CONSTRAINT "convenio_invites_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_invites" ADD CONSTRAINT "convenio_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
