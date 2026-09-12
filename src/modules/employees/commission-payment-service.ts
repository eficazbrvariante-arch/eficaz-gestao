import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { formatISODate, periodRange } from "@/lib/format";
import { getSellerCommissionHistory } from "./commission-service";

/**
 * Pagamento de comissão de venda (pedido do dono: botão "Pagar comissão" na
 * tela do vendedor, só Admin, já nasce pago, e o Ranking mostra o que foi
 * pago). A comissão é sempre calculada ao vivo (`getSellerCommissionHistory`)
 * — aqui só se "congela" o que foi pago, venda por venda
 * (`CommissionPaymentSale`), pra nunca pagar a mesma venda duas vezes.
 */

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Meio-dia no fuso da loja: guarda a data do filtro sem risco de virar o dia anterior/seguinte. */
function isoToDate(iso: string) {
  return new Date(`${iso}T12:00:00-03:00`);
}

export type CommissionPaymentPreview = {
  /** Vendas do período com comissão > 0 ainda não pagas. */
  unpaidSaleIds: string[];
  unpaidAmount: number;
  paidAmount: number;
  paidCount: number;
  /** saleId → comissão paga (congelada no pagamento). */
  paidBySale: Map<string, number>;
  /** Vendas pagas que foram canceladas depois — o valor já saiu, vale descontar à parte. */
  cancelledAfterPayment: { number: number; amount: number }[];
};

export async function getCommissionPaymentPreview(
  tenantId: string,
  userId: string,
  period: { from: string; to: string }
): Promise<CommissionPaymentPreview> {
  const range = periodRange(period.from, period.to);
  const history = await getSellerCommissionHistory(tenantId, userId, range);

  const [paidRows, cancelledRows] = await Promise.all([
    prisma.commissionPaymentSale.findMany({
      where: { tenantId, saleId: { in: history.sales.map((s) => s.saleId) } },
      select: { saleId: true, amount: true },
    }),
    prisma.commissionPaymentSale.findMany({
      where: {
        tenantId,
        userId,
        sale: { status: "CANCELLED", createdAt: { gte: range.start, lt: range.end } },
      },
      select: { amount: true, sale: { select: { number: true } } },
      orderBy: { sale: { number: "asc" } },
    }),
  ]);
  const paidBySale = new Map(paidRows.map((row) => [row.saleId, Number(row.amount)]));

  const unpaid = history.sales.filter((sale) => sale.commission > 0 && !paidBySale.has(sale.saleId));
  return {
    unpaidSaleIds: unpaid.map((sale) => sale.saleId),
    unpaidAmount: round2(unpaid.reduce((sum, sale) => sum + sale.commission, 0)),
    paidAmount: round2(paidRows.reduce((sum, row) => sum + Number(row.amount), 0)),
    paidCount: paidRows.length,
    paidBySale,
    cancelledAfterPayment: cancelledRows.map((row) => ({ number: row.sale.number, amount: Number(row.amount) })),
  };
}

export type RegisterCommissionPaymentResult =
  | { ok: true; amount: number; saleCount: number }
  | { ok: false; error: string };

/**
 * Registra o pagamento da comissão ainda não paga do período — recalcula tudo
 * aqui (nunca aceita valor vindo da tela). Lançamento no livro do
 * colaborador já como PAGO + uma linha por venda; se outra pessoa pagou uma
 * dessas vendas no meio do caminho, o `@unique` de `saleId` derruba a
 * transação inteira e nada é gravado.
 */
export async function registerCommissionPayment(
  ctx: { tenantId: string; createdById: string },
  input: { userId: string; from: string; to: string }
): Promise<RegisterCommissionPaymentResult> {
  const seller = await prisma.user.findFirst({
    where: { id: input.userId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!seller) return { ok: false, error: "Colaborador não encontrado." };

  const range = periodRange(input.from, input.to);
  const history = await getSellerCommissionHistory(ctx.tenantId, input.userId, range);
  const alreadyPaid = new Set(
    (
      await prisma.commissionPaymentSale.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: history.sales.map((s) => s.saleId) } },
        select: { saleId: true },
      })
    ).map((row) => row.saleId)
  );
  const toPay = history.sales.filter((sale) => sale.commission > 0 && !alreadyPaid.has(sale.saleId));
  const amount = round2(toPay.reduce((sum, sale) => sum + sale.commission, 0));
  if (toPay.length === 0 || amount <= 0) {
    return { ok: false, error: "Não há comissão a pagar nesse período — tudo já foi pago." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.employeeLedgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          userId: input.userId,
          type: "COMMISSION_PAYMENT",
          amount,
          description: `Comissão de ${formatISODate(input.from)} a ${formatISODate(input.to)} (${toPay.length} venda(s))`,
          status: "PAID",
          settledAt: new Date(),
          commissionPeriodFrom: isoToDate(input.from),
          commissionPeriodTo: isoToDate(input.to),
          createdById: ctx.createdById,
        },
        select: { id: true },
      });
      await tx.commissionPaymentSale.createMany({
        data: toPay.map((sale) => ({
          tenantId: ctx.tenantId,
          userId: input.userId,
          entryId: entry.id,
          saleId: sale.saleId,
          amount: sale.commission,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Parte dessas vendas acabou de ser paga por outra pessoa. Atualize a página." };
    }
    throw error;
  }

  return { ok: true, amount, saleCount: toPay.length };
}

export type CommissionPaymentHistoryRow = {
  id: string;
  amount: number;
  from: string | null;
  to: string | null;
  saleCount: number;
  createdAt: Date;
  createdByName: string;
};

export async function listCommissionPayments(tenantId: string, userId: string, take = 20) {
  const entries = await prisma.employeeLedgerEntry.findMany({
    where: { tenantId, userId, type: "COMMISSION_PAYMENT" },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      amount: true,
      commissionPeriodFrom: true,
      commissionPeriodTo: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { commissionSales: true } },
    },
  });
  return entries.map(
    (entry): CommissionPaymentHistoryRow => ({
      id: entry.id,
      amount: Number(entry.amount),
      from: entry.commissionPeriodFrom?.toISOString().slice(0, 10) ?? null,
      to: entry.commissionPeriodTo?.toISOString().slice(0, 10) ?? null,
      saleCount: entry._count.commissionSales,
      createdAt: entry.createdAt,
      createdByName: entry.createdBy.name,
    })
  );
}

export type CommissionPaidStatus = {
  paidAmount: number;
  /** Períodos de pagamento que tocam o intervalo consultado (pro aviso "Pago dd/mm–dd/mm"). */
  paidPeriods: { from: string; to: string }[];
};

/**
 * Pro Ranking: quanto da comissão de cada vendedor no intervalo já foi pago
 * (vendas ainda concluídas, pagas em qualquer pagamento) e os períodos pagos
 * que tocam o intervalo.
 */
export async function getCommissionPaidStatusByUsers(
  tenantId: string,
  userIds: string[],
  range: { start: Date; end: Date }
): Promise<Map<string, CommissionPaidStatus>> {
  const result = new Map<string, CommissionPaidStatus>();
  if (userIds.length === 0) return result;

  const [paidSums, entries] = await Promise.all([
    prisma.commissionPaymentSale.groupBy({
      by: ["userId"],
      where: {
        tenantId,
        userId: { in: userIds },
        sale: { status: "COMPLETED", createdAt: { gte: range.start, lt: range.end } },
      },
      _sum: { amount: true },
    }),
    prisma.employeeLedgerEntry.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        type: "COMMISSION_PAYMENT",
        commissionPeriodFrom: { lt: range.end },
        commissionPeriodTo: { gte: range.start },
      },
      orderBy: { commissionPeriodFrom: "asc" },
      select: { userId: true, commissionPeriodFrom: true, commissionPeriodTo: true },
    }),
  ]);

  for (const row of paidSums) {
    result.set(row.userId, { paidAmount: round2(Number(row._sum.amount ?? 0)), paidPeriods: [] });
  }
  for (const entry of entries) {
    if (!entry.commissionPeriodFrom || !entry.commissionPeriodTo) continue;
    const status = result.get(entry.userId) ?? { paidAmount: 0, paidPeriods: [] };
    status.paidPeriods.push({
      from: entry.commissionPeriodFrom.toISOString().slice(0, 10),
      to: entry.commissionPeriodTo.toISOString().slice(0, 10),
    });
    result.set(entry.userId, status);
  }
  return result;
}
