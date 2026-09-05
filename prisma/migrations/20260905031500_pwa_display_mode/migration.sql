-- CreateEnum
CREATE TYPE "DisplayMode" AS ENUM ('BROWSER', 'STANDALONE');

-- AlterTable
ALTER TABLE "visitor_sessions" ADD COLUMN     "displayMode" "DisplayMode" NOT NULL DEFAULT 'BROWSER';

-- CreateIndex
CREATE INDEX "visitor_sessions_tenantId_displayMode_firstSeenAt_idx" ON "visitor_sessions"("tenantId", "displayMode", "firstSeenAt");
