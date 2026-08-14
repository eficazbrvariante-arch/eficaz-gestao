import { prisma } from "@/lib/prisma";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Comissão não é padrão pra todo o catálogo — só entra no cálculo quem tem `commissionEnabled`. */
function itemCommission(
  itemTotal: number,
  product: { commissionEnabled: boolean; commissionPercent: unknown },
  defaultCommissionPercent: number
) {
  if (!product.commissionEnabled) return 0;
  const percent =
    product.commissionPercent !== null && product.commissionPercent !== undefined
      ? Number(product.commissionPercent)
      : defaultCommissionPercent;
  return (itemTotal * percent) / 100;
}

/** Comissão acumulada (todas as vendas concluídas) por vendedor — pra mostrar no card do colaborador. */
export async function getCommissionTotalsByUsers(
  tenantId: string,
  userIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (userIds.length === 0) return totals;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { defaultCommissionPercent: true },
  });
  const defaultPercent = Number(tenant.defaultCommissionPercent);

  const items = await prisma.saleItem.findMany({
    where: { sale: { tenantId, sellerId: { in: userIds }, status: "COMPLETED" } },
    select: {
      total: true,
      product: { select: { commissionEnabled: true, commissionPercent: true } },
      sale: { select: { sellerId: true } },
    },
  });

  for (const item of items) {
    const commission = itemCommission(Number(item.total), item.product, defaultPercent);
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
  userId: string
): Promise<{ sellerName: string; sales: SellerCommissionSaleRow[]; totalCommission: number }> {
  const [seller, tenant, sales] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { id: userId, tenantId }, select: { name: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { defaultCommissionPercent: true } }),
    prisma.sale.findMany({
      where: { tenantId, sellerId: userId, status: "COMPLETED" },
      select: {
        id: true,
        number: true,
        createdAt: true,
        total: true,
        items: {
          select: { total: true, product: { select: { commissionEnabled: true, commissionPercent: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const defaultPercent = Number(tenant.defaultCommissionPercent);

  const rows: SellerCommissionSaleRow[] = sales.map((sale) => ({
    saleId: sale.id,
    number: sale.number,
    createdAt: sale.createdAt,
    total: Number(sale.total),
    commission: round2(
      sale.items.reduce(
        (sum, item) => sum + itemCommission(Number(item.total), item.product, defaultPercent),
        0
      )
    ),
  }));

  return {
    sellerName: seller.name,
    sales: rows,
    totalCommission: round2(rows.reduce((sum, row) => sum + row.commission, 0)),
  };
}

export async function setDefaultCommissionPercent(tenantId: string, percent: number) {
  await prisma.tenant.update({ where: { id: tenantId }, data: { defaultCommissionPercent: percent } });
}
