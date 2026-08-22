import { prisma } from "@/lib/prisma";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * A alíquota única de 2% (e suas exceções por produto) só passou a valer a
 * partir desta data — pedido explícito do usuário pra não retroagir: venda
 * anterior a isso nunca gera comissão, mesmo que o período pedido comece
 * antes. Não existe "história" de comissão/ranking anterior a este dia.
 */
const COMMISSION_POLICY_EFFECTIVE_AT = new Date("2026-08-21T00:00:00-03:00");

/** `createdAt` efetivo pra consultas de comissão — nunca abre antes da data acima, mesmo sem `range` (total acumulado). */
function effectiveCreatedAtFilter(range?: { start: Date; end: Date }) {
  const gte =
    range && range.start.getTime() > COMMISSION_POLICY_EFFECTIVE_AT.getTime()
      ? range.start
      : COMMISSION_POLICY_EFFECTIVE_AT;
  return range ? { gte, lt: range.end } : { gte };
}

/**
 * Comissão de um item — todo o catálogo entra por padrão, na alíquota geral
 * (`Tenant.defaultCommissionPercent`). `commissionPercent`/`commissionType`
 * no produto são só uma exceção opcional: se o Admin configurar um
 * percentual (ou um valor fixo por unidade) específico naquele produto, ele
 * vale no lugar do padrão — `commissionEnabled` não é mais checado aqui
 * (antes precisava marcar produto por produto; agora comissiona sempre,
 * exceto quando alguém personaliza o valor).
 */
function itemCommission(
  itemTotal: number,
  quantity: number,
  product: {
    commissionType: "PERCENT" | "FIXED";
    commissionPercent: unknown;
    commissionFixedAmount: unknown;
  },
  defaultCommissionPercent: number
) {
  if (product.commissionType === "FIXED" && product.commissionFixedAmount != null) {
    return Number(product.commissionFixedAmount) * quantity;
  }
  const percent = product.commissionPercent != null ? Number(product.commissionPercent) : defaultCommissionPercent;
  return (itemTotal * percent) / 100;
}

/**
 * Comissão por vendedor — todas as vendas concluídas, ou só as de um
 * período (`range`) quando informado. Usada tanto pro total acumulado
 * (card do colaborador, sem `range`) quanto pro Ranking de Comissão (com
 * `range` do dia). Nunca considera venda anterior a
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

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { defaultCommissionPercent: true },
  });
  const defaultPercent = Number(tenant.defaultCommissionPercent);

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        tenantId,
        sellerId: { in: userIds },
        status: "COMPLETED",
        createdAt: effectiveCreatedAtFilter(range),
      },
    },
    select: {
      total: true,
      quantity: true,
      product: { select: { commissionType: true, commissionPercent: true, commissionFixedAmount: true } },
      sale: { select: { sellerId: true } },
    },
  });

  for (const item of items) {
    const commission = itemCommission(Number(item.total), item.quantity, item.product, defaultPercent);
    const sellerId = item.sale.sellerId;
    totals.set(sellerId, round2((totals.get(sellerId) ?? 0) + commission));
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

/** Histórico de vendas de um vendedor, com a comissão calculada em cada uma. */
export async function getSellerCommissionHistory(
  tenantId: string,
  userId: string,
  /** Período opcional (inclusivo) pra filtrar as vendas consideradas — ver `periodRange`. */
  range?: { start: Date; end: Date }
): Promise<{ sellerName: string; sales: SellerCommissionSaleRow[]; totalCommission: number }> {
  const [seller, tenant, sales] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { id: userId, tenantId }, select: { name: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { defaultCommissionPercent: true } }),
    prisma.sale.findMany({
      where: {
        tenantId,
        sellerId: userId,
        status: "COMPLETED",
        ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: {
        id: true,
        number: true,
        createdAt: true,
        total: true,
        items: {
          select: {
            total: true,
            quantity: true,
            product: { select: { commissionType: true, commissionPercent: true, commissionFixedAmount: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const defaultPercent = Number(tenant.defaultCommissionPercent);

  const rows: SellerCommissionSaleRow[] = sales.map((sale) => {
    // Venda continua listada (é histórico de verdade, útil pra comparar) —
    // só não gera comissão se for anterior à alíquota única entrar em vigor.
    const commission =
      sale.createdAt < COMMISSION_POLICY_EFFECTIVE_AT
        ? 0
        : sale.items.reduce(
            (sum, item) => sum + itemCommission(Number(item.total), item.quantity, item.product, defaultPercent),
            0
          );
    return {
      saleId: sale.id,
      number: sale.number,
      createdAt: sale.createdAt,
      total: Number(sale.total),
      commission: round2(commission),
    };
  });

  return {
    sellerName: seller.name,
    sales: rows,
    totalCommission: round2(rows.reduce((sum, row) => sum + row.commission, 0)),
  };
}

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
 * Ranking de vendedores pela comissão efetiva (comissão recebida ÷ total
 * vendido). Com a alíquota geral valendo pra todo o catálogo, o percentual
 * de cada vendedor tende a ficar igual à alíquota configurada — só varia se
 * o mix de produtos vendidos incluir algum item com percentual/valor fixo
 * personalizado (exceção configurada no cadastro do produto). Tanto o total
 * vendido quanto a comissão nunca contam venda anterior a
 * `COMMISSION_POLICY_EFFECTIVE_AT` — o ranking não tem história antes disso,
 * mesmo que o período pedido comece antes. Só entram vendedores com pelo
 * menos uma venda concluída (dentro dessa janela) no período informado
 * (padrão "hoje" — ver `resolvePeriod` na página).
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
    .sort((a, b) => b.percent - a.percent);
}
