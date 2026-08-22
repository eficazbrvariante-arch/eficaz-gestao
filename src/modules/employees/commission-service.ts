import { prisma } from "@/lib/prisma";
import { isCapinhaCategory, isPeliculaCategory } from "@/lib/seller-discount-rules";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Comissão fixa do kit capa + película com desconto do vendedor (ver abaixo), por unidade. */
const KIT_DISCOUNT_COMMISSION_PER_UNIT = 1;
/** Comissão fixa por cadastro de Proteção Eficaz aprovado, atribuída ao vendedor da venda original. */
const PROTECAO_EFICAZ_COMMISSION = 2;

type CommissionItemForKit = {
  quantity: number;
  discount: unknown;
  product: { category: { name: string | null } | null };
};

/**
 * Comissão fixa de R$1 por unidade de película 3D vendida com o desconto do
 * vendedor aplicado (`getSellerDiscountRule`), sempre que a mesma venda
 * também tem uma capinha — é a condição que libera esse desconto em
 * primeiro lugar. Independente de `Product.commissionEnabled` — soma por
 * cima de qualquer comissão normal do produto (hoje capinha/película não
 * têm comissão por % configurada, então na prática é a única comissão
 * dessas linhas).
 */
function kitDiscountCommissionForItems(items: CommissionItemForKit[]): number {
  const hasCapinha = items.some((item) => isCapinhaCategory(item.product.category?.name));
  if (!hasCapinha) return 0;

  const discountedPeliculaUnits = items
    .filter((item) => isPeliculaCategory(item.product.category?.name) && Number(item.discount) > 0)
    .reduce((sum, item) => sum + item.quantity, 0);

  return discountedPeliculaUnits * KIT_DISCOUNT_COMMISSION_PER_UNIT;
}

/**
 * Vendas com cadastro de Proteção Eficaz aprovado, por vendedor da venda
 * original (`saleNumber` não é FK — casamento por número, já validado
 * manualmente pelo Admin na aprovação). R$2 por cadastro aprovado.
 */
async function getProtecaoEficazCommissionByUsers(
  tenantId: string,
  userIds: string[],
  range?: { start: Date; end: Date }
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (userIds.length === 0) return totals;

  const approved = await prisma.protecaoEficaz.findMany({
    where: { tenantId, status: "APPROVED" },
    select: { saleNumber: true },
  });
  if (approved.length === 0) return totals;

  const sales = await prisma.sale.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      sellerId: { in: userIds },
      number: { in: approved.map((p) => p.saleNumber) },
      ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
    },
    select: { number: true, sellerId: true },
  });
  const sellerBySaleNumber = new Map(sales.map((s) => [s.number, s.sellerId]));

  for (const record of approved) {
    const sellerId = sellerBySaleNumber.get(record.saleNumber);
    if (!sellerId) continue;
    totals.set(sellerId, round2((totals.get(sellerId) ?? 0) + PROTECAO_EFICAZ_COMMISSION));
  }

  return totals;
}

/**
 * Comissão não é padrão pra todo o catálogo — só entra no cálculo quem tem
 * `commissionEnabled`. Dois modos, por produto: `PERCENT` (padrão) aplica a
 * alíquota sobre o total do item; `FIXED` paga um valor fixo em R$ por
 * unidade vendida, direto — não depende de preço nem desconto praticado.
 */
function itemCommission(
  itemTotal: number,
  quantity: number,
  product: {
    commissionEnabled: boolean;
    commissionType: "PERCENT" | "FIXED";
    commissionPercent: unknown;
    commissionFixedAmount: unknown;
  },
  defaultCommissionPercent: number
) {
  if (!product.commissionEnabled) return 0;
  if (product.commissionType === "FIXED") {
    const fixedAmount =
      product.commissionFixedAmount !== null && product.commissionFixedAmount !== undefined
        ? Number(product.commissionFixedAmount)
        : 0;
    return fixedAmount * quantity;
  }
  const percent =
    product.commissionPercent !== null && product.commissionPercent !== undefined
      ? Number(product.commissionPercent)
      : defaultCommissionPercent;
  return (itemTotal * percent) / 100;
}

/**
 * Comissão por vendedor — todas as vendas concluídas, ou só as de um
 * período (`range`) quando informado. Usada tanto pro total acumulado
 * (card do colaborador, sem `range`) quanto pro Ranking de Comissão (com
 * `range` do dia).
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
        ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      },
    },
    select: {
      total: true,
      quantity: true,
      discount: true,
      product: {
        select: {
          commissionEnabled: true,
          commissionType: true,
          commissionPercent: true,
          commissionFixedAmount: true,
          category: { select: { name: true } },
        },
      },
      sale: { select: { id: true, sellerId: true } },
    },
  });

  for (const item of items) {
    const commission = itemCommission(Number(item.total), item.quantity, item.product, defaultPercent);
    const sellerId = item.sale.sellerId;
    totals.set(sellerId, round2((totals.get(sellerId) ?? 0) + commission));
  }

  const itemsBySale = new Map<string, { sellerId: string; items: CommissionItemForKit[] }>();
  for (const item of items) {
    const entry = itemsBySale.get(item.sale.id) ?? { sellerId: item.sale.sellerId, items: [] };
    entry.items.push({ quantity: item.quantity, discount: item.discount, product: item.product });
    itemsBySale.set(item.sale.id, entry);
  }
  for (const { sellerId, items: saleItems } of itemsBySale.values()) {
    const kitCommission = kitDiscountCommissionForItems(saleItems);
    if (kitCommission > 0) {
      totals.set(sellerId, round2((totals.get(sellerId) ?? 0) + kitCommission));
    }
  }

  const protecaoTotals = await getProtecaoEficazCommissionByUsers(tenantId, userIds, range);
  for (const [sellerId, amount] of protecaoTotals) {
    totals.set(sellerId, round2((totals.get(sellerId) ?? 0) + amount));
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
            discount: true,
            product: {
              select: {
                commissionEnabled: true,
                commissionType: true,
                commissionPercent: true,
                commissionFixedAmount: true,
                category: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const defaultPercent = Number(tenant.defaultCommissionPercent);

  const approvedProtecaoNumbers = new Set(
    (
      await prisma.protecaoEficaz.findMany({
        where: { tenantId, status: "APPROVED", saleNumber: { in: sales.map((s) => s.number) } },
        select: { saleNumber: true },
      })
    ).map((r) => r.saleNumber)
  );

  const rows: SellerCommissionSaleRow[] = sales.map((sale) => {
    const productCommission = sale.items.reduce(
      (sum, item) => sum + itemCommission(Number(item.total), item.quantity, item.product, defaultPercent),
      0
    );
    const kitCommission = kitDiscountCommissionForItems(sale.items);
    const protecaoCommission = approvedProtecaoNumbers.has(sale.number) ? PROTECAO_EFICAZ_COMMISSION : 0;
    return {
      saleId: sale.id,
      number: sale.number,
      createdAt: sale.createdAt,
      total: Number(sale.total),
      commission: round2(productCommission + kitCommission + protecaoCommission),
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
 * vendido) — não é a alíquota configurada (essa é igual pro catálogo todo,
 * só variando por produto), e sim o resultado prático de cada um pelo mix de
 * produtos que vendeu. Só entram vendedores com pelo menos uma venda concluída
 * no período informado (padrão "hoje" — ver `resolvePeriod` na página).
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
        createdAt: { gte: start, lt: end },
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
