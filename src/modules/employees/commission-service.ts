import { prisma } from "@/lib/prisma";
import { todayISO, startOfMonthISO, nextMonthStartISO } from "@/lib/format";
import { COMMISSION_POLICY_EFFECTIVE_AT_ISO, COMMISSION_POLICY_EFFECTIVE_AT } from "./commission-policy";
import { getMonthlySaleCommissionsByUsers } from "./commission-tier-service";

export { COMMISSION_POLICY_EFFECTIVE_AT_ISO };

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** `createdAt` efetivo pra consultas de comissão — nunca abre antes da data acima, mesmo sem `range` (total acumulado). */
function effectiveCreatedAtFilter(range?: { start: Date; end: Date }) {
  const gte =
    range && range.start.getTime() > COMMISSION_POLICY_EFFECTIVE_AT.getTime()
      ? range.start
      : COMMISSION_POLICY_EFFECTIVE_AT;
  return range ? { gte, lt: range.end } : { gte };
}

/** Primeiro dia (`YYYY-MM-01`) do mês de uma data qualquer, no fuso da loja. */
function monthStartISOFor(date: Date) {
  return startOfMonthISO(todayISO(date));
}

/** Meses (`YYYY-MM-01`) que um intervalo `[start, end)` toca, em ordem — faixa é conceito mensal, o motor de `commission-tier-service` calcula um mês por vez. */
function enumerateMonthStartsISO(start: Date, end: Date): string[] {
  if (start >= end) return [];
  const months: string[] = [];
  const lastMonth = monthStartISOFor(new Date(end.getTime() - 1));
  let cursor = monthStartISOFor(start);
  while (cursor <= lastMonth) {
    months.push(cursor);
    cursor = nextMonthStartISO(cursor);
  }
  return months;
}

/**
 * Comissão por vendedor — todas as vendas concluídas, ou só as de um período
 * (`range`) quando informado. Usada tanto pro total acumulado (card do
 * colaborador, sem `range`) quanto pro Ranking de Comissão (com `range` do
 * período escolhido). Calcula pelo motor de faixa progressiva
 * (`getMonthlySaleCommissionsByUsers`, em `commission-tier-service.ts`) —
 * cada venda comissiona pela faixa que o vendedor ocupava naquele mês, mês a
 * mês, nunca por uma alíquota única fixa. Nunca considera venda anterior a
 * `COMMISSION_POLICY_EFFECTIVE_AT`, mesmo pedindo o total acumulado desde
 * sempre.
 */
export async function getCommissionTotalsByUsers(
  tenantId: string,
  userIds: string[],
  range?: { start: Date; end: Date }
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (userIds.length === 0) return totals;

  const windowStart =
    range && range.start.getTime() > COMMISSION_POLICY_EFFECTIVE_AT.getTime()
      ? range.start
      : COMMISSION_POLICY_EFFECTIVE_AT;
  const windowEnd = range?.end ?? new Date();
  if (windowStart >= windowEnd) return totals;

  for (const monthStartISO of enumerateMonthStartsISO(windowStart, windowEnd)) {
    const bySeller = await getMonthlySaleCommissionsByUsers(tenantId, userIds, monthStartISO);
    for (const [userId, saleMap] of bySeller) {
      let sum = totals.get(userId) ?? 0;
      for (const { createdAt, commission } of saleMap.values()) {
        if (createdAt >= windowStart && createdAt < windowEnd) sum += commission;
      }
      totals.set(userId, round2(sum));
    }
  }

  return totals;
}

export type SellerCommissionSaleRow = {
  saleId: string;
  number: number;
  createdAt: Date;
  total: number;
  commission: number;
};

/**
 * Histórico de vendas de um vendedor, com a comissão calculada em cada uma
 * pela faixa progressiva do mês daquela venda (ver `getCommissionTotalsByUsers`).
 */
export async function getSellerCommissionHistory(
  tenantId: string,
  userId: string,
  /** Período opcional (inclusivo) pra filtrar as vendas consideradas — ver `periodRange`. */
  range?: { start: Date; end: Date }
): Promise<{ sellerName: string; sales: SellerCommissionSaleRow[]; totalCommission: number }> {
  const [seller, sales] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { id: userId, tenantId }, select: { name: true } }),
    prisma.sale.findMany({
      where: {
        tenantId,
        sellerId: userId,
        status: "COMPLETED",
        ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: { id: true, number: true, createdAt: true, total: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const windowStart =
    range && range.start.getTime() > COMMISSION_POLICY_EFFECTIVE_AT.getTime()
      ? range.start
      : COMMISSION_POLICY_EFFECTIVE_AT;
  const windowEnd = range?.end ?? new Date();

  // Venda continua listada (é histórico de verdade, útil pra comparar) — só
  // não entra no mapa (fica 0) se for anterior à comissão entrar em vigor.
  const commissionBySale = new Map<string, number>();
  if (windowStart < windowEnd) {
    for (const monthStartISO of enumerateMonthStartsISO(windowStart, windowEnd)) {
      const saleMap = (await getMonthlySaleCommissionsByUsers(tenantId, [userId], monthStartISO)).get(userId);
      if (!saleMap) continue;
      for (const [saleId, { commission }] of saleMap) {
        commissionBySale.set(saleId, round2((commissionBySale.get(saleId) ?? 0) + commission));
      }
    }
  }

  const rows: SellerCommissionSaleRow[] = sales.map((sale) => ({
    saleId: sale.id,
    number: sale.number,
    createdAt: sale.createdAt,
    total: Number(sale.total),
    commission: commissionBySale.get(sale.id) ?? 0,
  }));

  return {
    sellerName: seller.name,
    sales: rows,
    totalCommission: round2(rows.reduce((sum, row) => sum + row.commission, 0)),
  };
}

/** Alíquota-base usada quando nenhuma faixa foi configurada ainda (ver `getTierSetForMonth`) — não é mais usada diretamente no cálculo por venda. */
export async function setDefaultCommissionPercent(tenantId: string, percent: number) {
  await prisma.tenant.update({ where: { id: tenantId }, data: { defaultCommissionPercent: percent } });
}

export type CommissionRankingRow = {
  userId: string;
  userName: string;
  totalSales: number;
  totalCommission: number;
  /** Comissão efetiva: quanto do total vendido virou comissão, em %. */
  percent: number;
};

/**
 * Ranking de vendedores por comissão acumulada em R$ (quem ganhou mais no
 * período, pela faixa progressiva de cada mês — ver `getCommissionTotalsByUsers`),
 * do maior pro menor. Também calcula `percent` (comissão ÷ total vendido) —
 * só um detalhe informativo (ex.: no card de detalhamento), não usado pra
 * ordenar. Tanto o total vendido quanto a comissão nunca contam venda
 * anterior a `COMMISSION_POLICY_EFFECTIVE_AT` — o ranking não tem história
 * antes disso, mesmo que o período pedido comece antes. Só entram
 * vendedores com pelo menos uma venda concluída (dentro dessa janela) no
 * período informado (padrão "hoje" — ver `resolvePeriod` na página).
 */
export async function getCommissionRanking(
  tenantId: string,
  range: { start: Date; end: Date }
): Promise<CommissionRankingRow[]> {
  const sellers = await prisma.user.findMany({
    where: { tenantId, active: true, role: { in: ["SELLER", "MANAGER"] } },
    select: { id: true, name: true },
  });
  if (sellers.length === 0) return [];
  const userIds = sellers.map((s) => s.id);

  const { start, end } = range;

  const [commissionTotals, salesTotals] = await Promise.all([
    getCommissionTotalsByUsers(tenantId, userIds, { start, end }),
    prisma.sale.groupBy({
      by: ["sellerId"],
      where: {
        tenantId,
        sellerId: { in: userIds },
        status: "COMPLETED",
        createdAt: effectiveCreatedAtFilter({ start, end }),
      },
      _sum: { total: true },
    }),
  ]);
  const salesByUser = new Map(salesTotals.map((row) => [row.sellerId, Number(row._sum.total ?? 0)]));

  return sellers
    .map((seller) => {
      const totalSales = salesByUser.get(seller.id) ?? 0;
      const totalCommission = commissionTotals.get(seller.id) ?? 0;
      return {
        userId: seller.id,
        userName: seller.name,
        totalSales,
        totalCommission,
        percent: totalSales > 0 ? round2((totalCommission / totalSales) * 100) : 0,
      };
    })
    .filter((row) => row.totalSales > 0)
    .sort((a, b) => b.totalCommission - a.totalCommission);
}
