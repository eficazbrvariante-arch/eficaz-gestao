import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { FiadoStatus } from "@/generated/prisma/enums";

/** `YYYY-MM-DD` (fuso de Brasília) para `Date`, ao meio-dia para não escorregar de dia — mesma regra do resto do app (ex.: `(admin)/clientes/actions.ts`). */
function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T12:00:00-03:00`);
}

/**
 * "Vencido" nunca é um valor gravado — só existe enquanto o lançamento
 * continua PENDING e a data prevista já passou. Assim que alguém marca como
 * pago, some sozinho; nunca precisa de um job pra manter isso atualizado.
 */
export function isFiadoOverdue(entry: { status: FiadoStatus; dueDate: Date | null }): boolean {
  return entry.status === "PENDING" && entry.dueDate !== null && entry.dueDate < new Date();
}

type CreateFiadoEntryData = {
  customerId: string;
  amount: number;
  dueDate?: string | null;
  note?: string | null;
  saleId?: string | null;
  /** Preenchido quando o fiado nasce do acerto financeiro de uma OS de assistência técnica. */
  repairOrderId?: string | null;
  createdById: string;
};

/**
 * Lança um fiado — chamado na hora de fechar uma venda no PDV ou entregar uma
 * OS de assistência técnica com a forma de pagamento "Fiado" (dentro da mesma
 * transação, `saleId`/`repairOrderId` preenchido), ou manualmente pela ficha
 * do cliente (ambos nulos). Aceita um client de transação opcional pra poder
 * ser reaproveitado nesses casos.
 */
export async function createFiadoEntry(
  tenantId: string,
  data: CreateFiadoEntryData,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  return client.fiadoEntry.create({
    data: {
      tenantId,
      customerId: data.customerId,
      amount: data.amount,
      dueDate: parseDateOnly(data.dueDate),
      note: data.note || null,
      saleId: data.saleId || null,
      repairOrderId: data.repairOrderId || null,
      createdById: data.createdById,
    },
  });
}

export async function listFiadoEntriesByCustomer(tenantId: string, customerId: string) {
  return prisma.fiadoEntry.findMany({
    where: { tenantId, customerId },
    include: {
      sale: { select: { number: true } },
      createdBy: { select: { name: true } },
      paidBy: { select: { name: true } },
      paidCashRegister: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Formas aceitas pra receber um fiado — as que entram no caixa do dia. */
export const FIADO_RECEIPT_METHODS = ["CASH", "PIX", "DEBIT", "CREDIT"] as const;
export type FiadoReceiptMethod = (typeof FIADO_RECEIPT_METHODS)[number];

export type FiadoResult = { ok: true; amount: number } | { ok: false; error: string };

/**
 * Recebe um fiado pendente (pedido do dono): grava na hora data/horário do
 * recebimento, forma de pagamento, quem recebeu e o caixa aberto em que o
 * dinheiro entrou — o valor passa a somar nos totais daquele caixa (ver
 * `getCashSummary`), senão o fechamento acusaria sobra na gaveta. Exige caixa
 * aberto. Não mexe em `creditBalance` — fiado e crédito de loja são saldos
 * separados.
 */
export async function receiveFiadoPayment(
  tenantId: string,
  entryId: string,
  input: { method: FiadoReceiptMethod; receivedById: string }
): Promise<FiadoResult> {
  if (!FIADO_RECEIPT_METHODS.includes(input.method)) {
    return { ok: false, error: "Escolha a forma de pagamento." };
  }
  const register = await prisma.cashRegister.findFirst({
    where: { tenantId, status: "OPEN" },
    select: { id: true },
  });
  if (!register) return { ok: false, error: "Abra o caixa antes de receber o fiado — o valor entra no caixa do dia." };

  const entry = await prisma.fiadoEntry.findFirst({
    where: { id: entryId, tenantId },
    select: { amount: true },
  });
  if (!entry) return { ok: false, error: "Lançamento de fiado não encontrado." };

  // `status: PENDING` no WHERE: dois cliques (ou dois caixas) nunca recebem o mesmo fiado duas vezes.
  const updated = await prisma.fiadoEntry.updateMany({
    where: { id: entryId, tenantId, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: input.method,
      paidById: input.receivedById,
      paidCashRegisterId: register.id,
    },
  });
  if (updated.count === 0) return { ok: false, error: "Esse fiado já está pago." };
  return { ok: true, amount: Number(entry.amount) };
}

/**
 * Desfaz um recebimento marcado por engano — volta pra pendente e sai do
 * caixa. Só enquanto o caixa em que entrou continua aberto: mexer num caixa
 * já fechado mudaria um fechamento já conferido. Fiado pago antes do
 * registro de caixa existir (sem caixa) pode voltar a qualquer momento.
 */
export async function revertFiadoPayment(tenantId: string, entryId: string): Promise<FiadoResult> {
  const entry = await prisma.fiadoEntry.findFirst({
    where: { id: entryId, tenantId },
    select: { status: true, amount: true, paidCashRegister: { select: { status: true } } },
  });
  if (!entry) return { ok: false, error: "Lançamento de fiado não encontrado." };
  if (entry.status !== "PAID") return { ok: false, error: "Esse fiado já está pendente." };
  if (entry.paidCashRegister && entry.paidCashRegister.status !== "OPEN") {
    return {
      ok: false,
      error: "O caixa em que esse pagamento entrou já foi fechado — não dá pra voltar pra pendente por aqui.",
    };
  }

  await prisma.fiadoEntry.update({
    where: { id: entryId },
    data: { status: "PENDING", paidAt: null, paymentMethod: null, paidById: null, paidCashRegisterId: null },
  });
  return { ok: true, amount: Number(entry.amount) };
}
