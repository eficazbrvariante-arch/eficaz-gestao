import { prisma } from "@/lib/prisma";
import { todayRange } from "@/lib/format";
import {
  computeWorkedMinutes,
  getNextExpectedAttendanceType,
  resolveEffectiveAttendanceEntry,
  type TodayAttendanceStatus,
} from "./attendance-rules";
import type { AttendanceEntryType } from "@/generated/prisma/enums";

export type PunchAttendanceContext = {
  tenantId: string;
  userId: string;
  deviceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type PunchAttendanceInput = {
  selfieUrl?: string | null;
  /** Marcação sem selfie, só aceita quando `canWaiveAttendanceSelfie(actor.role)`. */
  waived?: boolean;
  waiveReason?: string | null;
  /** Quem autorizou a dispensa — normalmente o próprio colaborador, quando ele
   *  tem a permissão (ex.: ADMIN/MANAGER registrando o próprio ponto). */
  waivedById?: string | null;
};

export type PunchAttendanceResult =
  | { ok: true; entryId: string; type: AttendanceEntryType }
  | { ok: false; error: string };

/**
 * Registra a marcação de ponto do colaborador. O tipo NUNCA vem do cliente —
 * é sempre recalculado aqui a partir das marcações de hoje (ver
 * `getNextExpectedAttendanceType`), então não há como um colaborador escolher
 * livremente "Entrada" duas vezes ou pular uma etapa do ciclo.
 */
export async function punchAttendance(
  ctx: PunchAttendanceContext,
  input: PunchAttendanceInput
): Promise<PunchAttendanceResult> {
  const { start, end } = todayRange();
  const todaysEntries = await prisma.attendanceEntry.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, occurredAt: { gte: start, lt: end } },
    select: { type: true, occurredAt: true },
  });

  const nextType = getNextExpectedAttendanceType(todaysEntries);
  if (!nextType) {
    return { ok: false, error: "O ciclo de ponto de hoje já foi encerrado." };
  }

  if (!input.selfieUrl && !input.waived) {
    return { ok: false, error: "Selfie obrigatória para registrar o ponto." };
  }
  if (input.waived && !input.waiveReason?.trim()) {
    return { ok: false, error: "Informe o motivo da dispensa de selfie." };
  }

  const entry = await prisma.attendanceEntry.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: nextType,
      selfieUrl: input.selfieUrl || null,
      selfieWaived: Boolean(input.waived),
      selfieWaivedById: input.waived ? input.waivedById ?? null : null,
      selfieWaivedReason: input.waived ? input.waiveReason?.trim() || null : null,
      deviceId: ctx.deviceId || null,
      ipAddress: ctx.ipAddress || null,
      userAgent: ctx.userAgent || null,
    },
    select: { id: true, type: true },
  });

  return { ok: true, entryId: entry.id, type: entry.type };
}

/** Próxima marcação esperada para o colaborador hoje, sem registrar nada. */
export async function getNextExpectedForToday(
  tenantId: string,
  userId: string
): Promise<AttendanceEntryType | null> {
  const { start, end } = todayRange();
  const todaysEntries = await prisma.attendanceEntry.findMany({
    where: { tenantId, userId, occurredAt: { gte: start, lt: end } },
    select: { type: true, occurredAt: true },
  });
  return getNextExpectedAttendanceType(todaysEntries);
}

export type EffectiveAttendanceEntry = {
  id: string;
  userId: string;
  type: AttendanceEntryType;
  occurredAt: Date;
  corrected: boolean;
  selfieUrl: string | null;
  selfieWaived: boolean;
};

/**
 * Marcações de um período, já resolvidas para o valor efetivo (aplicando a
 * correção mais recente de cada uma, quando existir) — ver
 * `resolveEffectiveAttendanceEntry`. Nunca modifica `AttendanceEntry`.
 */
export async function listEffectiveEntries(
  tenantId: string,
  filter: { userId?: string; from: Date; to: Date }
): Promise<EffectiveAttendanceEntry[]> {
  const entries = await prisma.attendanceEntry.findMany({
    where: {
      tenantId,
      ...(filter.userId ? { userId: filter.userId } : {}),
      occurredAt: { gte: filter.from, lt: filter.to },
    },
    include: {
      corrections: { select: { newType: true, newOccurredAt: true, createdAt: true } },
    },
    orderBy: { occurredAt: "asc" },
  });

  return entries.map((entry) => {
    const effective = resolveEffectiveAttendanceEntry(entry, entry.corrections);
    return {
      id: entry.id,
      userId: entry.userId,
      type: effective.type,
      occurredAt: effective.occurredAt,
      corrected: effective.corrected,
      selfieUrl: entry.selfieUrl,
      selfieWaived: entry.selfieWaived,
    };
  });
}

export type TodayAttendanceOverview = {
  userId: string;
  userName: string;
  status: TodayAttendanceStatus;
  lastEntryAt: Date | null;
  workedMinutes: number;
};

/**
 * Visão de hoje para o painel administrativo: quem está presente, ausente, em
 * intervalo ou já encerrou o expediente, por colaborador ativo do tenant.
 */
export async function getTodayAttendanceOverview(
  tenantId: string
): Promise<TodayAttendanceOverview[]> {
  const { start, end } = todayRange();
  const [users, entries] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listEffectiveEntries(tenantId, { from: start, to: end }),
  ]);

  const entriesByUser = new Map<string, EffectiveAttendanceEntry[]>();
  for (const entry of entries) {
    const list = entriesByUser.get(entry.userId) ?? [];
    list.push(entry);
    entriesByUser.set(entry.userId, list);
  }

  return users.map((user) => {
    const userEntries = (entriesByUser.get(user.id) ?? []).sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
    );
    const last = userEntries.at(-1);
    const { workedMinutes } = computeWorkedMinutes(userEntries);

    let status: TodayAttendanceStatus = "NOT_STARTED";
    if (last) {
      if (last.type === "CLOCK_OUT") status = "FINISHED";
      else if (last.type === "BREAK_START") status = "ON_BREAK";
      else status = "WORKING";
    }

    return {
      userId: user.id,
      userName: user.name,
      status,
      lastEntryAt: last?.occurredAt ?? null,
      workedMinutes,
    };
  });
}

export type CorrectAttendanceEntryInput = {
  entryId: string;
  newType: AttendanceEntryType;
  newOccurredAt: Date;
  reason: string;
};

export type CorrectAttendanceEntryResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Correção administrativa: sempre aditiva. Nunca faz UPDATE em
 * `AttendanceEntry` — cria uma `AttendanceCorrection` guardando o valor
 * efetivo anterior (original ou a correção mais recente até agora), o novo
 * valor, quem corrigiu e o motivo.
 */
export async function correctAttendanceEntry(
  tenantId: string,
  correctedById: string,
  input: CorrectAttendanceEntryInput
): Promise<CorrectAttendanceEntryResult> {
  if (!input.reason.trim()) {
    return { ok: false, error: "Informe o motivo da correção." };
  }

  const entry = await prisma.attendanceEntry.findFirst({
    where: { id: input.entryId, tenantId },
    include: { corrections: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!entry) return { ok: false, error: "Marcação não encontrada." };

  const currentEffective = entry.corrections[0]
    ? { type: entry.corrections[0].newType, occurredAt: entry.corrections[0].newOccurredAt }
    : { type: entry.type, occurredAt: entry.occurredAt };

  await prisma.attendanceCorrection.create({
    data: {
      tenantId,
      entryId: entry.id,
      correctedById,
      originalType: currentEffective.type,
      originalOccurredAt: currentEffective.occurredAt,
      newType: input.newType,
      newOccurredAt: input.newOccurredAt,
      reason: input.reason.trim(),
    },
  });

  return { ok: true, userId: entry.userId };
}

export type AddMissingAttendanceEntryInput = {
  userId: string;
  type: AttendanceEntryType;
  occurredAt: Date;
  reason: string;
};

export type AddMissingAttendanceEntryResult =
  | { ok: true; entryId: string }
  | { ok: false; error: string };

/**
 * Marcação esquecida (ex.: colaborador saiu sem bater "Saída"), lançada
 * diretamente pelo administrador — ao contrário de `correctAttendanceEntry`,
 * cria uma `AttendanceEntry` nova em vez de corrigir uma existente, porque
 * aqui não existe marcação nenhuma pra apontar como origem. Fica marcada como
 * `selfieWaived` (mesmo tratamento visual de "sem selfie" já usado pra
 * dispensa) com o motivo do lançamento manual.
 */
export async function addMissingAttendanceEntry(
  tenantId: string,
  addedById: string,
  input: AddMissingAttendanceEntryInput
): Promise<AddMissingAttendanceEntryResult> {
  if (!input.reason.trim()) {
    return { ok: false, error: "Informe o motivo da marcação adicionada." };
  }

  const employee = await prisma.user.findFirst({
    where: { id: input.userId, tenantId },
    select: { id: true },
  });
  if (!employee) return { ok: false, error: "Colaborador não encontrado." };

  const dayStart = new Date(input.occurredAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const sameDayEntries = await prisma.attendanceEntry.findMany({
    where: { tenantId, userId: input.userId, occurredAt: { gte: dayStart, lt: dayEnd } },
    select: { type: true },
  });
  if (sameDayEntries.some((entry) => entry.type === input.type)) {
    return { ok: false, error: "Esse dia já tem uma marcação desse tipo." };
  }

  const entry = await prisma.attendanceEntry.create({
    data: {
      tenantId,
      userId: input.userId,
      type: input.type,
      occurredAt: input.occurredAt,
      selfieWaived: true,
      selfieWaivedById: addedById,
      selfieWaivedReason: input.reason.trim(),
    },
    select: { id: true },
  });

  return { ok: true, entryId: entry.id };
}
