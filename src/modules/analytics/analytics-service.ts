import { prisma } from "@/lib/prisma";
import { todayRange, todayISO } from "@/lib/format";
import { getSalesSummary, getProductPerformance } from "@/modules/reports/report-service";

const ONLINE_NOW_WINDOW_MS = 5 * 60 * 1000;

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Visitantes distintos (por `visitorId`) que abriram a loja hoje. */
export async function getUniqueVisitorsToday(tenantId: string): Promise<number> {
  const { start, end } = todayRange();
  const rows = await prisma.visitorSession.findMany({
    where: { tenantId, firstSeenAt: { gte: start, lt: end } },
    distinct: ["visitorId"],
    select: { visitorId: true },
  });
  return rows.length;
}

/** Total de visitas (sessões/abas) hoje — diferente de visitantes únicos. */
export async function getTotalVisitsToday(tenantId: string): Promise<number> {
  const { start, end } = todayRange();
  return prisma.visitorSession.count({
    where: { tenantId, firstSeenAt: { gte: start, lt: end } },
  });
}

/** Sessões com atividade (evento ou heartbeat) nos últimos 5 minutos. */
export async function getOnlineNowCount(tenantId: string): Promise<number> {
  return prisma.visitorSession.count({
    where: { tenantId, lastSeenAt: { gte: new Date(Date.now() - ONLINE_NOW_WINDOW_MS) } },
  });
}

/** Faturamento/pedidos/ticket médio de hoje — reaproveita a mesma consulta dos Relatórios. */
export async function getTodayRevenueSummary(tenantId: string) {
  const today = todayISO();
  return getSalesSummary(tenantId, { from: today, to: today });
}

/**
 * Taxa de conversão de hoje: pedidos do **catálogo online concluídos** ÷
 * visitantes únicos. De propósito só `Order`, sem `Sale` do PDV — venda de
 * balcão não tem relação com quem visitou o site, misturar infla o número com
 * atividade que nunca passou pela loja online. Por isso é diferente do card
 * "pedidos hoje" (que soma PDV + online, mesma convenção de `getSalesSummary`).
 */
export async function getConversionRateToday(tenantId: string): Promise<number> {
  const { start, end } = todayRange();
  const [onlineOrders, uniqueVisitors] = await Promise.all([
    prisma.order.count({
      where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
    }),
    getUniqueVisitorsToday(tenantId),
  ]);
  if (uniqueVisitors === 0) return 0;
  return round1((onlineOrders / uniqueVisitors) * 100);
}

export type ProductViewRow = { productId: string; name: string; views: number };

/** Produtos mais vistos hoje, pela contagem de eventos `PRODUCT_VIEW`. */
export async function getMostViewedProducts(
  tenantId: string,
  take = 5
): Promise<ProductViewRow[]> {
  const { start, end } = todayRange();
  const grouped = await prisma.analyticsEvent.groupBy({
    by: ["productId"],
    where: { tenantId, type: "PRODUCT_VIEW", createdAt: { gte: start, lt: end }, productId: { not: null } },
    _count: true,
    orderBy: { _count: { productId: "desc" } },
    take,
  });
  if (grouped.length === 0) return [];

  const ids = grouped.map((row) => row.productId).filter((id): id is string => id !== null);
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return grouped.map((row) => ({
    productId: row.productId ?? "",
    name: nameById.get(row.productId ?? "") ?? "Produto removido",
    views: row._count,
  }));
}

/** Produtos mais vendidos hoje — reaproveita `getProductPerformance` dos Relatórios. */
export async function getMostSoldProductsToday(tenantId: string, take = 5) {
  const today = todayISO();
  const performance = await getProductPerformance(tenantId, { from: today, to: today });
  return [...performance].sort((a, b) => b.quantity - a.quantity).slice(0, take);
}

export type BreakdownRow<T extends string> = { key: T; count: number };

/** Sessões de hoje por origem de acesso (Google, Instagram, Facebook, WhatsApp, Direto, Outro). */
export async function getTrafficSourceBreakdownToday(tenantId: string) {
  const { start, end } = todayRange();
  const grouped = await prisma.visitorSession.groupBy({
    by: ["trafficSource"],
    where: { tenantId, firstSeenAt: { gte: start, lt: end } },
    _count: true,
  });
  return grouped
    .map((row) => ({ key: row.trafficSource, count: row._count }))
    .sort((a, b) => b.count - a.count);
}

/** Sessões de hoje por tipo de dispositivo (celular, tablet, computador). */
export async function getDeviceBreakdownToday(tenantId: string) {
  const { start, end } = todayRange();
  const grouped = await prisma.visitorSession.groupBy({
    by: ["deviceType"],
    where: { tenantId, firstSeenAt: { gte: start, lt: end } },
    _count: true,
  });
  return grouped
    .map((row) => ({ key: row.deviceType, count: row._count }))
    .sort((a, b) => b.count - a.count);
}
