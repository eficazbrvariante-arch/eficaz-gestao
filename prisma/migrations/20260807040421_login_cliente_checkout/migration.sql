-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
-- publicAccessToken nasce opcional porque a tabela já tem pedidos (default do
-- Prisma é gerado no client, não existe DEFAULT no banco) -- backfill abaixo
-- antes de tornar a coluna obrigatória/única.
ALTER TABLE "orders" ADD COLUMN     "publicAccessToken" TEXT;

UPDATE "orders" SET "publicAccessToken" = md5(random()::text || clock_timestamp()::text) WHERE "publicAccessToken" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "publicAccessToken" SET NOT NULL;

-- AlterTable
ALTER TABLE "product_reviews" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_login_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_tokenHash_key" ON "customer_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_sessions_tenantId_customerId_idx" ON "customer_sessions"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_sessions_expiresAt_idx" ON "customer_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "customer_login_attempts_tenantId_username_createdAt_idx" ON "customer_login_attempts"("tenantId", "username", "createdAt");

-- CreateIndex
CREATE INDEX "customer_login_attempts_tenantId_ipAddress_createdAt_idx" ON "customer_login_attempts"("tenantId", "ipAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_username_key" ON "customers"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "orders_publicAccessToken_key" ON "orders"("publicAccessToken");

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_tenantId_productId_customerId_key" ON "product_reviews"("tenantId", "productId", "customerId");

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
