-- CreateEnum
CREATE TYPE "TrafficSource" AS ENUM ('GOOGLE', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'DIRECT', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGE_VIEW', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_START', 'PURCHASE', 'FLASH_VIEW', 'FLASH_CLICK');

-- CreateTable
CREATE TABLE "visitor_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'DESKTOP',
    "trafficSource" "TrafficSource" NOT NULL DEFAULT 'DIRECT',
    "referrerHost" TEXT,
    "geoCity" TEXT,
    "geoState" TEXT,
    "geoCountry" TEXT,
    "userAgent" TEXT,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "AnalyticsEventType" NOT NULL,
    "path" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "isFlashDeal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visitor_sessions_tenantId_firstSeenAt_visitorId_idx" ON "visitor_sessions"("tenantId", "firstSeenAt", "visitorId");

-- CreateIndex
CREATE INDEX "visitor_sessions_tenantId_lastSeenAt_idx" ON "visitor_sessions"("tenantId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "visitor_sessions_tenantId_trafficSource_firstSeenAt_idx" ON "visitor_sessions"("tenantId", "trafficSource", "firstSeenAt");

-- CreateIndex
CREATE INDEX "visitor_sessions_tenantId_deviceType_firstSeenAt_idx" ON "visitor_sessions"("tenantId", "deviceType", "firstSeenAt");

-- CreateIndex
CREATE INDEX "analytics_events_tenantId_type_createdAt_idx" ON "analytics_events"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_sessionId_type_idx" ON "analytics_events"("sessionId", "type");

-- AddForeignKey
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "visitor_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
