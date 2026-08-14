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

export type EmployeeLedgerSummaryRow = {
  userId: string;
  userName: string;
  advancePending: number;
  purchasePending: number;
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
      totalPending: 0,
    };
    const amount = Number(entry.amount);
    if (entry.type === "ADVANCE") current.advancePending = round2(current.advancePending + amount);
    else current.purchasePending = round2(current.purchasePending + amount);
    current.totalPending = round2(current.advancePending + current.purchasePending);
    byUser.set(entry.userId, current);
  }

  return [...byUser.values()].sort((a, b) => b.totalPending - a.totalPending);
}
