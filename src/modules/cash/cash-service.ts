import { prisma } from "@/lib/prisma";

/** Caixa aberto do tenant, se houver. Só pode existir um por vez. */
export async function getOpenCashRegister(tenantId: string) {
  return prisma.cashRegister.findFirst({
    where: { tenantId, status: "OPEN" },
    include: { openedBy: { select: { name: true } } },
    orderBy: { openedAt: "desc" },
  });
}

export type CashSummary = {
  openingAmount: number;
  cashSales: number;
  otherSales: number;
  supplies: number;
  withdrawals: number;
  /** Quanto o sistema espera encontrar na gaveta (só dinheiro em espécie). */
  expectedInDrawer: number;
  salesCount: number;
};

/**
 * Consolida a movimentação de um caixa.
 *
 * O valor esperado na gaveta considera apenas dinheiro em espécie:
 * pagamentos em PIX, débito e crédito não passam pelo caixa físico.
 * Vendas canceladas são desconsideradas.
 */
export async function getCashSummary(
  tenantId: string,
  cashRegisterId: string
): Promise<CashSummary> {
  const register = await prisma.cashRegister.findFirstOrThrow({
    where: { id: cashRegisterId, tenantId },
  });

  const [payments, movements, salesCount] = await Promise.all([
    prisma.payment.groupBy({
      by: ["method"],
      where: { sale: { cashRegisterId, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    prisma.cashMovement.groupBy({
      by: ["type"],
      where: { cashRegisterId },
      _sum: { amount: true },
    }),
    prisma.sale.count({ where: { cashRegisterId, status: "COMPLETED" } }),
  ]);

  const sumByMethod = (method: string) =>
    Number(payments.find((p) => p.method === method)?._sum.amount ?? 0);
  const sumByType = (type: string) =>
    Number(movements.find((m) => m.type === type)?._sum.amount ?? 0);

  const openingAmount = Number(register.openingAmount);
  const cashSales = sumByMethod("CASH");
  const otherSales =
    sumByMethod("PIX") + sumByMethod("DEBIT") + sumByMethod("CREDIT");
  const supplies = sumByType("SUPPLY");
  const withdrawals = sumByType("WITHDRAWAL");

  return {
    openingAmount,
    cashSales,
    otherSales,
    supplies,
    withdrawals,
    expectedInDrawer: openingAmount + cashSales + supplies - withdrawals,
    salesCount,
  };
}
