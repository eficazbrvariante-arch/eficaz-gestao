import { prisma } from "@/lib/prisma";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

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
  /** Vendas do PDV, por forma de pagamento. */
  cashSales: number;
  otherSales: number;
  pixSales: number;
  debitSales: number;
  creditSales: number;
  /** Recebimentos de Assistência Técnica (entrada + saldo na entrega), por forma de pagamento. */
  repairCashReceipts: number;
  repairPixReceipts: number;
  repairDebitReceipts: number;
  repairCreditReceipts: number;
  /** Soma de vendas + assistência técnica, por forma de pagamento — para relatórios. */
  totalCash: number;
  totalPix: number;
  totalDebit: number;
  totalCredit: number;
  supplies: number;
  withdrawals: number;
  /** Quanto o sistema espera encontrar na gaveta (só dinheiro em espécie: vendas + assistência técnica). */
  expectedInDrawer: number;
  /** Soma de todas as formas de pagamento (dinheiro + Pix + débito + crédito), vendas + assistência técnica — o valor total do caixa. */
  grandTotal: number;
  salesCount: number;
};

/**
 * Consolida a movimentação de um caixa.
 *
 * O valor esperado na gaveta considera apenas dinheiro em espécie:
 * pagamentos em PIX, débito e crédito não passam pelo caixa físico. Isso
 * inclui tanto vendas do PDV quanto recebimentos de Assistência Técnica —
 * os dois usam a mesma gaveta física. Vendas canceladas são desconsideradas
 * (a Assistência Técnica não tem "cancelamento" de recebimento: um pagamento
 * já registrado é definitivo, corrigir exige estorno manual, fora de escopo
 * daqui).
 */
export async function getCashSummary(
  tenantId: string,
  cashRegisterId: string
): Promise<CashSummary> {
  const register = await prisma.cashRegister.findFirstOrThrow({
    where: { id: cashRegisterId, tenantId },
  });

  const [payments, repairPayments, movements, salesCount] = await Promise.all([
    prisma.payment.groupBy({
      by: ["method"],
      where: { sale: { cashRegisterId, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    prisma.repairOrderPayment.groupBy({
      by: ["method"],
      where: { cashRegisterId },
      _sum: { amount: true },
    }),
    prisma.cashMovement.groupBy({
      by: ["type"],
      where: { cashRegisterId },
      _sum: { amount: true },
    }),
    prisma.sale.count({ where: { cashRegisterId, status: "COMPLETED" } }),
  ]);

  const sumByMethod = (list: typeof payments, method: string) =>
    Number(list.find((p) => p.method === method)?._sum.amount ?? 0);
  const sumByType = (type: string) =>
    Number(movements.find((m) => m.type === type)?._sum.amount ?? 0);

  const openingAmount = Number(register.openingAmount);
  const cashSales = sumByMethod(payments, "CASH");
  const pixSales = sumByMethod(payments, "PIX");
  const debitSales = sumByMethod(payments, "DEBIT");
  const creditSales = sumByMethod(payments, "CREDIT");
  const otherSales = pixSales + debitSales + creditSales;

  const repairCashReceipts = sumByMethod(repairPayments, "CASH");
  const repairPixReceipts = sumByMethod(repairPayments, "PIX");
  const repairDebitReceipts = sumByMethod(repairPayments, "DEBIT");
  const repairCreditReceipts = sumByMethod(repairPayments, "CREDIT");

  const supplies = sumByType("SUPPLY");
  const withdrawals = sumByType("WITHDRAWAL");

  const totalCash = round2(cashSales + repairCashReceipts);
  const totalPix = round2(pixSales + repairPixReceipts);
  const totalDebit = round2(debitSales + repairDebitReceipts);
  const totalCredit = round2(creditSales + repairCreditReceipts);

  return {
    openingAmount,
    cashSales,
    otherSales,
    pixSales,
    debitSales,
    creditSales,
    repairCashReceipts,
    repairPixReceipts,
    repairDebitReceipts,
    repairCreditReceipts,
    totalCash,
    totalPix,
    totalDebit,
    totalCredit,
    supplies,
    withdrawals,
    expectedInDrawer: round2(openingAmount + cashSales + repairCashReceipts + supplies - withdrawals),
    grandTotal: round2(totalCash + totalPix + totalDebit + totalCredit),
    salesCount,
  };
}

export type SubmitCashForReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Envio da contagem às cegas pelo Vendedor: só o dinheiro contado na gaveta
 * (o valor esperado é lido do banco aqui dentro, nunca do formulário, nem
 * mostrado antes de enviar) mais as fotos dos comprovantes da maquininha.
 * Não fecha o caixa — deixa como `PENDING_REVIEW`, liberado pro próximo
 * turno abrir um novo caixa sem esperar a revisão do Admin (ver
 * `finalizeCashRegisterReview`).
 */
export async function submitCashRegisterForReview(
  ctx: { tenantId: string; userId: string },
  input: { registerId: string; countedAmount: number; receiptPhotoUrls: string[]; notes?: string }
): Promise<SubmitCashForReviewResult> {
  const register = await prisma.cashRegister.findFirst({
    where: { id: input.registerId, tenantId: ctx.tenantId, status: "OPEN" },
  });
  if (!register) return { ok: false, error: "Caixa aberto não encontrado." };

  const summary = await getCashSummary(ctx.tenantId, register.id);

  await prisma.cashRegister.update({
    where: { id: register.id },
    data: {
      status: "PENDING_REVIEW",
      reviewSubmittedById: ctx.userId,
      reviewSubmittedAt: new Date(),
      countedAmount: input.countedAmount,
      expectedAmount: summary.expectedInDrawer,
      expectedDebitAmount: summary.totalDebit,
      expectedCreditAmount: summary.totalCredit,
      expectedPixAmount: summary.totalPix,
      receiptPhotoUrls: input.receiptPhotoUrls,
      notes: input.notes || register.notes,
    },
  });

  return { ok: true };
}

export type FinalizeCashReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Finalização de vez (só ADMIN, ver `canFinalizeCashRegisterReview`) de um
 * caixa que o Vendedor enviou pra revisão — depois de olhar a contagem de
 * dinheiro e as fotos dos comprovantes da maquininha. O Admin confere e
 * digita débito/crédito/Pix aqui (o Vendedor só confere dinheiro, às cegas);
 * o valor esperado de cada forma já foi gravado no envio pra revisão
 * (`submitCashRegisterForReview`) e não muda depois.
 */
export async function finalizeCashRegisterReview(
  ctx: { tenantId: string; userId: string },
  input: {
    registerId: string;
    countedDebitAmount: number;
    countedCreditAmount: number;
    countedPixAmount: number;
    notes?: string;
  }
): Promise<FinalizeCashReviewResult> {
  const register = await prisma.cashRegister.findFirst({
    where: { id: input.registerId, tenantId: ctx.tenantId, status: "PENDING_REVIEW" },
  });
  if (!register) return { ok: false, error: "Caixa pendente de revisão não encontrado." };

  await prisma.cashRegister.update({
    where: { id: register.id },
    data: {
      status: "CLOSED",
      closedById: ctx.userId,
      closedAt: new Date(),
      countedDebitAmount: input.countedDebitAmount,
      countedCreditAmount: input.countedCreditAmount,
      countedPixAmount: input.countedPixAmount,
      notes: input.notes || register.notes,
    },
  });

  return { ok: true };
}
