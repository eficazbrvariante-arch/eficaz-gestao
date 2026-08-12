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
  createdById: string;
};

/**
 * Lança um fiado — chamado tanto na hora de fechar uma venda no PDV com a
 * forma de pagamento "Fiado" (dentro da mesma transação, `saleId` preenchido)
 * quanto manualmente pela ficha do cliente (`saleId` nulo). Aceita um client
 * de transação opcional pra poder ser reaproveitado nos dois casos.
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
      createdById: data.createdById,
    },
  });
}

export async function listFiadoEntriesByCustomer(tenantId: string, customerId: string) {
  return prisma.fiadoEntry.findMany({
    where: { tenantId, customerId },
    include: { sale: { select: { number: true } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export type MarkFiadoPaidResult = { ok: true } | { ok: false; error: string };

/** Marca um lançamento PENDING como pago. Não mexe em `creditBalance` — fiado e crédito de loja são saldos separados. */
export async function markFiadoEntryPaid(tenantId: string, entryId: string): Promise<MarkFiadoPaidResult> {
  const entry = await prisma.fiadoEntry.findFirst({
    where: { id: entryId, tenantId },
    select: { id: true, status: true },
  });
  if (!entry) return { ok: false, error: "Lançamento de fiado não encontrado." };
  if (entry.status === "PAID") return { ok: false, error: "Esse lançamento já está pago." };

  await prisma.fiadoEntry.update({
    where: { id: entryId },
    data: { status: "PAID" },
  });
  return { ok: true };
}
