import { prisma } from "@/lib/prisma";
import { periodRange } from "@/lib/format";

/**
 * Camada de consulta dos relatórios.
 *
 * O faturamento do negócio soma **duas origens**: as vendas do PDV (`Sale`) e os
 * pedidos do catálogo já concluídos (`Order`). Um pedido online só entra depois
 * de concluído — antes disso ele é uma intenção de compra, não receita.
 * Vendas e pedidos cancelados nunca entram.
 */

export type Period = { from: string; to: string };

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type SalesSummary = {
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
  orderCount: number;
  averageTicket: number;
  /** Recorte por origem, para saber quanto veio do balcão e quanto do catálogo. */
  pdvRevenue: number;
  pdvCount: number;
  onlineRevenue: number;
  onlineCount: number;
  /** Taxas de entrega cobradas nos pedidos online (não é lucro de produto). */
  deliveryFees: number;
  cancelledCount: number;
  cancelledValue: number;
};

export async function getSalesSummary(
  tenantId: string,
  period: Period
): Promise<SalesSummary> {
  const { start, end } = periodRange(period.from, period.to);
  const createdAt = { gte: start, lt: end };

  const [sales, orders, cancelledSales, cancelledOrders] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId, status: "COMPLETED", createdAt },
      _sum: { total: true, costTotal: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { tenantId, status: "COMPLETED", createdAt },
      _sum: { total: true, costTotal: true, deliveryFee: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { tenantId, status: "CANCELLED", createdAt },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { tenantId, status: "CANCELLED", createdAt },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const pdvRevenue = toNumber(sales._sum.total);
  const onlineRevenue = toNumber(orders._sum.total);
  const deliveryFees = toNumber(orders._sum.deliveryFee);
  const revenue = round2(pdvRevenue + onlineRevenue);

  const cost = round2(toNumber(sales._sum.costTotal) + toNumber(orders._sum.costTotal));
  // A taxa de entrega é repassada ao entregador/loja, não margem de produto:
  // sai do cálculo do lucro bruto para não inflar o resultado.
  const grossProfit = round2(revenue - deliveryFees - cost);
  const orderCount = sales._count + orders._count;

  return {
    revenue,
    cost,
    grossProfit,
    marginPercent:
      revenue - deliveryFees > 0
        ? round2((grossProfit / (revenue - deliveryFees)) * 100)
        : 0,
    orderCount,
    averageTicket: orderCount > 0 ? round2(revenue / orderCount) : 0,
    pdvRevenue: round2(pdvRevenue),
    pdvCount: sales._count,
    onlineRevenue: round2(onlineRevenue),
    onlineCount: orders._count,
    deliveryFees: round2(deliveryFees),
    cancelledCount: cancelledSales._count + cancelledOrders._count,
    cancelledValue: round2(
      toNumber(cancelledSales._sum.total) + toNumber(cancelledOrders._sum.total)
    ),
  };
}

export type DailyRevenue = { date: string; revenue: number; count: number };

/** Faturamento dia a dia, com os dias sem venda preenchidos com zero. */
export async function getDailyRevenue(
  tenantId: string,
  period: Period
): Promise<DailyRevenue[]> {
  const { start, end } = periodRange(period.from, period.to);
  const createdAt = { gte: start, lt: end };

  const [sales, orders] = await Promise.all([
    prisma.sale.findMany({
      where: { tenantId, status: "COMPLETED", createdAt },
      select: { createdAt: true, total: true },
    }),
    prisma.order.findMany({
      where: { tenantId, status: "COMPLETED", createdAt },
      select: { createdAt: true, total: true },
    }),
  ]);

  const byDay = new Map<string, { revenue: number; count: number }>();
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

  for (const record of [...sales, ...orders]) {
    const key = dayKey(record.createdAt);
    const current = byDay.get(key) ?? { revenue: 0, count: 0 };
    byDay.set(key, {
      revenue: current.revenue + toNumber(record.total),
      count: current.count + 1,
    });
  }

  const result: DailyRevenue[] = [];
  const cursor = new Date(`${period.from}T12:00:00Z`);
  const last = new Date(`${period.to}T12:00:00Z`);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    result.push({
      date: key,
      revenue: round2(entry?.revenue ?? 0),
      count: entry?.count ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export type PaymentBreakdown = { method: string; amount: number; count: number };

/**
 * Faturamento por forma de pagamento.
 * No PDV uma venda pode ter várias formas (pagamento combinado); no catálogo o
 * pedido tem uma só.
 */
export async function getRevenueByPaymentMethod(
  tenantId: string,
  period: Period
): Promise<PaymentBreakdown[]> {
  const { start, end } = periodRange(period.from, period.to);

  const [payments, orders] = await Promise.all([
    prisma.payment.groupBy({
      by: ["method"],
      where: {
        sale: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const totals = new Map<string, { amount: number; count: number }>();
  const add = (method: string, amount: number, count: number) => {
    const current = totals.get(method) ?? { amount: 0, count: 0 };
    totals.set(method, { amount: current.amount + amount, count: current.count + count });
  };

  for (const row of payments) add(row.method, toNumber(row._sum.amount), row._count);
  // paymentMethod só é nulo em pedido de WhatsApp (`origin: WHATSAPP`) ainda não combinado
  // com o cliente — não deveria chegar em COMPLETED sem isso definido, mas se chegar, cai
  // aqui em vez de quebrar a apuração.
  for (const row of orders) add(row.paymentMethod ?? "A combinar", toNumber(row._sum.total), row._count);

  return [...totals.entries()]
    .map(([method, value]) => ({
      method,
      amount: round2(value.amount),
      count: value.count,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type SellerBreakdown = { name: string; revenue: number; count: number };

/** Vendas por vendedor. Pedidos do catálogo entram como "Catálogo online". */
export async function getRevenueBySeller(
  tenantId: string,
  period: Period
): Promise<SellerBreakdown[]> {
  const { start, end } = periodRange(period.from, period.to);
  const createdAt = { gte: start, lt: end };

  const [bySeller, onlineOrders] = await Promise.all([
    prisma.sale.groupBy({
      by: ["sellerId"],
      where: { tenantId, status: "COMPLETED", createdAt },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { tenantId, status: "COMPLETED", createdAt },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const sellers = await prisma.user.findMany({
    where: { id: { in: bySeller.map((row) => row.sellerId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(sellers.map((seller) => [seller.id, seller.name]));

  const rows: SellerBreakdown[] = bySeller.map((row) => ({
    name: nameById.get(row.sellerId) ?? "Usuário removido",
    revenue: round2(toNumber(row._sum.total)),
    count: row._count,
  }));

  if (onlineOrders._count > 0) {
    rows.push({
      name: "Catálogo online",
      revenue: round2(toNumber(onlineOrders._sum.total)),
      count: onlineOrders._count,
    });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
}

export type ProductPerformance = {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
};

/**
 * Desempenho por produto no período, somando itens de venda e de pedido.
 * Agrupado pelo nome registrado no momento da venda, que é o que aparece no
 * comprovante do cliente.
 *
 * O desconto dado na venda inteira é **rateado** entre os itens, na proporção do
 * valor de cada um. Sem esse rateio, a soma do faturamento por produto ficaria
 * maior que o faturamento real do período.
 */
export async function getProductPerformance(
  tenantId: string,
  period: Period
): Promise<ProductPerformance[]> {
  const { start, end } = periodRange(period.from, period.to);
  const createdAt = { gte: start, lt: end };

  const [saleItems, orderItems] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: { tenantId, status: "COMPLETED", createdAt } },
      select: {
        nameSnapshot: true,
        quantity: true,
        total: true,
        unitCost: true,
        sale: { select: { subtotal: true, discount: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: { order: { tenantId, status: "COMPLETED", createdAt } },
      select: { nameSnapshot: true, quantity: true, total: true, unitCost: true },
    }),
  ]);

  const totals = new Map<string, { quantity: number; revenue: number; cost: number }>();

  const accumulate = (
    name: string,
    quantity: number,
    revenue: number,
    unitCost: number
  ) => {
    const current = totals.get(name) ?? { quantity: 0, revenue: 0, cost: 0 };
    totals.set(name, {
      quantity: current.quantity + quantity,
      revenue: current.revenue + revenue,
      cost: current.cost + unitCost * quantity,
    });
  };

  for (const item of saleItems) {
    const itemTotal = toNumber(item.total);
    const subtotal = toNumber(item.sale.subtotal);
    const discount = toNumber(item.sale.discount);
    // Parcela do desconto que cabe a este item.
    const share = subtotal > 0 ? (itemTotal / subtotal) * discount : 0;
    accumulate(item.nameSnapshot, item.quantity, itemTotal - share, toNumber(item.unitCost));
  }

  // Pedidos do catálogo não têm desconto no total — só taxa de entrega, que
  // não é receita de produto e por isso fica fora daqui.
  for (const item of orderItems) {
    accumulate(
      item.nameSnapshot,
      item.quantity,
      toNumber(item.total),
      toNumber(item.unitCost)
    );
  }

  return [...totals.entries()].map(([name, value]) => {
    const revenue = round2(value.revenue);
    const cost = round2(value.cost);
    const profit = round2(revenue - cost);
    return {
      name,
      quantity: value.quantity,
      revenue,
      cost,
      profit,
      marginPercent: revenue > 0 ? round2((profit / revenue) * 100) : 0,
    };
  });
}

/** Produtos ativos sem nenhuma venda no período — candidatos a promoção. */
export async function getStaleProducts(tenantId: string, period: Period) {
  const { start, end } = periodRange(period.from, period.to);
  const createdAt = { gte: start, lt: end };

  const [products, soldSale, soldOrder] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, stockQty: true, salePrice: true, costPrice: true },
      orderBy: { name: "asc" },
    }),
    prisma.saleItem.findMany({
      where: { sale: { tenantId, status: "COMPLETED", createdAt } },
      select: { productId: true },
      distinct: ["productId"],
    }),
    prisma.orderItem.findMany({
      where: { order: { tenantId, status: "COMPLETED", createdAt } },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ]);

  const sold = new Set([
    ...soldSale.map((item) => item.productId),
    ...soldOrder.map((item) => item.productId),
  ]);

  return products
    .filter((product) => !sold.has(product.id) && product.stockQty > 0)
    .map((product) => ({
      name: product.name,
      stockQty: product.stockQty,
      // Quanto de dinheiro está parado neste produto.
      stockValue: round2(toNumber(product.costPrice) * product.stockQty),
    }));
}

export type CancellationRow = {
  origin: "PDV" | "Catálogo";
  reference: string;
  date: Date;
  total: number;
  reason: string | null;
  responsible: string | null;
};

export async function getCancellations(
  tenantId: string,
  period: Period
): Promise<CancellationRow[]> {
  const { start, end } = periodRange(period.from, period.to);
  const createdAt = { gte: start, lt: end };

  const [sales, orders] = await Promise.all([
    prisma.sale.findMany({
      where: { tenantId, status: "CANCELLED", createdAt },
      include: { cancelledBy: { select: { name: true } } },
      orderBy: { cancelledAt: "desc" },
    }),
    prisma.order.findMany({
      where: { tenantId, status: "CANCELLED", createdAt },
      orderBy: { cancelledAt: "desc" },
    }),
  ]);

  const rows: CancellationRow[] = [
    ...sales.map((sale) => ({
      origin: "PDV" as const,
      reference: `Venda #${sale.number}`,
      date: sale.cancelledAt ?? sale.createdAt,
      total: toNumber(sale.total),
      reason: sale.cancelReason,
      responsible: sale.cancelledBy?.name ?? null,
    })),
    ...orders.map((order) => ({
      origin: "Catálogo" as const,
      reference: `Pedido #${order.number}`,
      date: order.cancelledAt ?? order.createdAt,
      total: toNumber(order.total),
      reason: order.cancelReason,
      responsible: null,
    })),
  ];

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Caixas fechados no período, com a diferença apurada na conferência. */
export async function getCashRegisterReport(tenantId: string, period: Period) {
  const { start, end } = periodRange(period.from, period.to);

  const registers = await prisma.cashRegister.findMany({
    where: { tenantId, openedAt: { gte: start, lt: end } },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      _count: { select: { sales: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  const movements = await prisma.cashMovement.groupBy({
    by: ["type"],
    where: { tenantId, createdAt: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: true,
  });

  const sumByType = (type: string) =>
    round2(toNumber(movements.find((row) => row.type === type)?._sum.amount));

  return {
    registers: registers.map((register) => ({
      id: register.id,
      openedAt: register.openedAt,
      closedAt: register.closedAt,
      openedBy: register.openedBy.name,
      closedBy: register.closedBy?.name ?? null,
      openingAmount: toNumber(register.openingAmount),
      expectedAmount: register.expectedAmount === null ? null : toNumber(register.expectedAmount),
      countedAmount: register.countedAmount === null ? null : toNumber(register.countedAmount),
      difference:
        register.expectedAmount === null || register.countedAmount === null
          ? null
          : round2(toNumber(register.countedAmount) - toNumber(register.expectedAmount)),
      salesCount: register._count.sales,
      status: register.status,
    })),
    withdrawals: sumByType("WITHDRAWAL"),
    supplies: sumByType("SUPPLY"),
  };
}

export type StoreCreditUsageRow = {
  id: string;
  saleId: string;
  saleNumber: number;
  customerName: string;
  amount: number;
  createdAt: Date;
};

/**
 * Vendas do período pagas (total ou parcialmente) com crédito de loja — esse
 * valor não é dinheiro novo entrando no caixa, é saldo que o cliente já
 * tinha, sendo consumido. Mostrado à parte no relatório de Caixa pra quem
 * fecha o caixa não estranhar a diferença entre venda e dinheiro recebido.
 */
export async function getStoreCreditUsage(
  tenantId: string,
  period: Period
): Promise<StoreCreditUsageRow[]> {
  const { start, end } = periodRange(period.from, period.to);

  const payments = await prisma.payment.findMany({
    where: {
      method: "STORE_CREDIT",
      sale: { tenantId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
    },
    include: {
      sale: { select: { number: true, createdAt: true, customer: { select: { name: true } } } },
    },
    orderBy: { sale: { createdAt: "desc" } },
  });

  return payments.map((payment) => ({
    id: payment.id,
    saleId: payment.saleId,
    saleNumber: payment.sale.number,
    customerName: payment.sale.customer?.name ?? "Cliente removido",
    amount: toNumber(payment.amount),
    createdAt: payment.sale.createdAt,
  }));
}
