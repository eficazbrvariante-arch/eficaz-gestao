import { prisma } from "@/lib/prisma";
import type { CreateEmployeeLedgerEntryInput } from "@/lib/validations/employee-ledger";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type EmployeeLedgerResult = { ok: true; id: string } | { ok: false; error: string };

export async function createEmployeeLedgerEntry(
  ctx: { tenantId: string; createdById: string },
  input: CreateEmployeeLedgerEntryInput
): Promise<EmployeeLedgerResult> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!user) return { ok: false, error: "Colaborador não encontrado." };

  const created = await prisma.employeeLedgerEntry.create({
    data: {
      tenantId: ctx.tenantId,
      userId: input.userId,
      type: input.type,
      amount: round2(input.amount),
      description: input.description || null,
      createdById: ctx.createdById,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

export async function settleEmployeeLedgerEntry(
  tenantId: string,
  id: string
): Promise<EmployeeLedgerResult> {
  const entry = await prisma.employeeLedgerEntry.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  });
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };
  if (entry.status === "PAID") return { ok: true, id: entry.id };

  await prisma.employeeLedgerEntry.update({
    where: { id },
    data: { status: "PAID", settledAt: new Date() },
  });

  return { ok: true, id: entry.id };
}

/**
 * Reverte um lançamento marcado como pago de volta pra pendente — corrige um
 * "Marcar como pago" (ou confirmação por selfie) feito por engano. Mantém
 * `paidSelfieUrl` como prova de que o colaborador confirmou ter levado a
 * mercadoria/adiantamento; só limpa `status`/`settledAt`, que é o que faz o
 * valor voltar a contar como pendente.
 */
export async function revertEmployeeLedgerEntryToPending(
  tenantId: string,
  id: string
): Promise<EmployeeLedgerResult> {
  const entry = await prisma.employeeLedgerEntry.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  });
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };
  if (entry.status === "PENDING") return { ok: true, id: entry.id };

  await prisma.employeeLedgerEntry.update({
    where: { id },
    data: { status: "PENDING", settledAt: null },
  });

  return { ok: true, id: entry.id };
}

export type RevertDebtEntriesResult =
  | { ok: true; count: number; total: number }
  | { ok: false; error: string };

/**
 * Reverte de uma vez todos os Adiantamento/Mercadoria de um colaborador que
 * estão marcados como pagos — limpeza dos lançamentos fechados por engano
 * pela confirmação por selfie no Ponto (bug travado em
 * `confirmEmployeeLedgerEntryBySelfie`), que sozinha faz a dívida do
 * colaborador com a loja sumir do desconto. Mesma regra do botão por linha
 * (`revertEmployeeLedgerEntryToPending`), só que em lote: mantém
 * `paidSelfieUrl` como prova de que ele confirmou ter levado o
 * item/adiantamento, e devolve o valor pra contar como desconto no
 * Pagamento por horas. Nunca toca em HOURLY_PAYMENT nem OTHER, que são o que
 * a loja deve a ele — esses continuam pagos.
 */
export async function revertPaidDebtEntriesToPending(
  tenantId: string,
  userId: string
): Promise<RevertDebtEntriesResult> {
  const entries = await prisma.employeeLedgerEntry.findMany({
    where: { tenantId, userId, status: "PAID", type: { in: ["ADVANCE", "PURCHASE"] } },
    select: { id: true, amount: true },
  });
  if (entries.length === 0) {
    return {
      ok: false,
      error: "Nenhum adiantamento ou mercadoria marcado como pago pra reverter neste colaborador.",
    };
  }

  await prisma.employeeLedgerEntry.updateMany({
    where: { tenantId, id: { in: entries.map((entry) => entry.id) } },
    data: { status: "PENDING", settledAt: null },
  });

  const total = round2(entries.reduce((sum, entry) => sum + Number(entry.amount), 0));
  return { ok: true, count: entries.length, total };
}

export type DeleteEmployeeLedgerEntryResult =
  | { ok: true; userName: string; type: string; amount: number }
  | { ok: false; error: string };

/**
 * Exclui um lançamento lançado errado — diferente de `settleEmployeeLedgerEntry`
 * (que só muda o status), remove o registro por completo. Sem restrição por
 * status: um lançamento marcado como pago por engano também precisa poder
 * ser apagado.
 */
export async function deleteEmployeeLedgerEntry(
  tenantId: string,
  id: string
): Promise<DeleteEmployeeLedgerEntryResult> {
  const entry = await prisma.employeeLedgerEntry.findFirst({
    where: { id, tenantId },
    select: { id: true, type: true, amount: true, user: { select: { name: true } } },
  });
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };

  await prisma.employeeLedgerEntry.delete({ where: { id: entry.id } });

  return { ok: true, userName: entry.user.name, type: entry.type, amount: Number(entry.amount) };
}

export type EmployeeLedgerSummaryRow = {
  userId: string;
  userName: string;
  advancePending: number;
  purchasePending: number;
  hourlyPending: number;
  otherPending: number;
  totalPending: number;
};

/** Saldo pendente por colaborador — só quem tem pelo menos um lançamento pendente. */
export async function getEmployeeLedgerSummary(tenantId: string): Promise<EmployeeLedgerSummaryRow[]> {
  const pending = await prisma.employeeLedgerEntry.findMany({
    where: { tenantId, status: "PENDING" },
    select: { userId: true, type: true, amount: true, user: { select: { name: true } } },
  });

  const byUser = new Map<string, EmployeeLedgerSummaryRow>();
  for (const entry of pending) {
    const current = byUser.get(entry.userId) ?? {
      userId: entry.userId,
      userName: entry.user.name,
      advancePending: 0,
      purchasePending: 0,
      hourlyPending: 0,
      otherPending: 0,
      totalPending: 0,
    };
    const amount = Number(entry.amount);
    if (entry.type === "ADVANCE") current.advancePending = round2(current.advancePending + amount);
    else if (entry.type === "PURCHASE") current.purchasePending = round2(current.purchasePending + amount);
    else if (entry.type === "HOURLY_PAYMENT") current.hourlyPending = round2(current.hourlyPending + amount);
    else current.otherPending = round2(current.otherPending + amount);
    current.totalPending = round2(
      current.advancePending + current.purchasePending + current.hourlyPending + current.otherPending
    );
    byUser.set(entry.userId, current);
  }

  return [...byUser.values()].sort((a, b) => b.totalPending - a.totalPending);
}

/**
 * Adiantamento + Mercadoria pendentes de um único colaborador — o que ele
 * deve à loja, usado como desconto informativo na tela de Pagamento por
 * horas (ver `HorasPanel`). Não inclui Pagamento por hora nem Outro, que não
 * são dívida do colaborador com a loja.
 */
export async function getEmployeeDeductionsPending(
  tenantId: string,
  userId: string
): Promise<{ advancePending: number; purchasePending: number }> {
  const pending = await prisma.employeeLedgerEntry.findMany({
    where: { tenantId, userId, status: "PENDING", type: { in: ["ADVANCE", "PURCHASE"] } },
    select: { type: true, amount: true },
  });

  let advancePending = 0;
  let purchasePending = 0;
  for (const entry of pending) {
    const amount = Number(entry.amount);
    if (entry.type === "ADVANCE") advancePending = round2(advancePending + amount);
    else purchasePending = round2(purchasePending + amount);
  }
  return { advancePending, purchasePending };
}

export type PendingLedgerEntry = {
  id: string;
  type: CreateEmployeeLedgerEntryInput["type"];
  amount: number;
  description: string | null;
  createdAt: Date;
};

/**
 * Lançamentos pendentes de um colaborador que a loja deve a ele — usado na
 * confirmação por selfie no Ponto ("confirmar recebimento"). Não inclui
 * ADVANCE/PURCHASE: esses são dívida do colaborador COM a loja (adiantamento
 * recebido, mercadoria levada), então "confirmar recebimento" não se aplica
 * — quitar essa dívida é feito pelo desconto na hora de pagar as horas (ver
 * `getEmployeeDeductionsPending`) ou manualmente pelo Admin/Gerente na
 * tabela de Lançamentos, nunca pelo próprio colaborador com uma selfie.
 */
export async function listPendingLedgerEntriesForEmployee(
  tenantId: string,
  userId: string
): Promise<PendingLedgerEntry[]> {
  const entries = await prisma.employeeLedgerEntry.findMany({
    where: { tenantId, userId, status: "PENDING", type: { in: ["HOURLY_PAYMENT", "OTHER"] } },
    select: { id: true, type: true, amount: true, description: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return entries.map((entry) => ({ ...entry, amount: Number(entry.amount) }));
}

/**
 * Confirmação do próprio colaborador de que recebeu o pagamento, com selfie
 * como "assinatura" — só quita um lançamento que pertence a ele mesmo,
 * diferente de `settleEmployeeLedgerEntry` (ação administrativa, sem foto).
 * Nunca aceita ADVANCE/PURCHASE aqui, mesma trava de
 * `listPendingLedgerEntriesForEmployee` — sem isso o colaborador "confirmava
 * recebimento" de uma mercadoria/adiantamento que só tinha levado da loja, e
 * o lançamento virava PAID como se a dívida já tivesse sido quitada.
 */
export async function confirmEmployeeLedgerEntryBySelfie(
  tenantId: string,
  userId: string,
  entryId: string,
  selfieUrl: string
): Promise<EmployeeLedgerResult> {
  const entry = await prisma.employeeLedgerEntry.findFirst({
    where: { id: entryId, tenantId, userId },
    select: { id: true, status: true, type: true },
  });
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };
  if (entry.type === "ADVANCE" || entry.type === "PURCHASE") {
    return {
      ok: false,
      error: "Adiantamento e mercadoria são dívida com a loja — não dá pra confirmar como recebido.",
    };
  }
  if (entry.status === "PAID") return { ok: true, id: entry.id };

  await prisma.employeeLedgerEntry.update({
    where: { id: entry.id },
    data: { status: "PAID", settledAt: new Date(), paidSelfieUrl: selfieUrl },
  });

  return { ok: true, id: entry.id };
}
