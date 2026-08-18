"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, getCurrentUser } from "@/lib/session";
import { canCorrectAttendance, canWaiveAttendanceSelfie } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { todayRange } from "@/lib/format";
import { recordAudit } from "@/modules/audit/audit-service";
import {
  addMissingAttendanceEntry,
  correctAttendanceEntry,
  getNextExpectedForToday,
  listEffectiveEntries,
  punchAttendance,
  type EffectiveAttendanceEntry,
} from "@/modules/attendance/attendance-service";
import type { AttendanceEntryType } from "@/generated/prisma/enums";
import {
  addMissingAttendanceEntrySchema,
  correctAttendanceEntrySchema,
  punchAttendanceSchema,
  type AddMissingAttendanceEntryInput,
  type CorrectAttendanceEntryInput,
  type PunchAttendanceInput,
} from "@/lib/validations/attendance";

/**
 * Confere que `userId` é um colaborador ativo do mesmo tenant de quem está
 * logado — a loja compartilha um único login entre até 3 pessoas no caixa,
 * então quem bate o ponto escolhe o próprio nome numa lista em vez de trocar
 * de sessão; isso impede escolher um colaborador de fora do tenant ou já
 * desligado.
 */
async function requireActiveTenantEmployee(tenantId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, tenantId, active: true },
    select: { id: true, name: true },
  });
}

export async function punchAttendanceAction(input: PunchAttendanceInput) {
  const user = await requireUser();

  const parsed = punchAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const employee = await requireActiveTenantEmployee(user.tenantId, parsed.data.userId);
  if (!employee) {
    return { error: "Selecione um colaborador válido." };
  }

  if (parsed.data.waived && !canWaiveAttendanceSelfie(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar o ponto sem selfie." };
  }

  const sessionUser = await getCurrentUser();
  const headerList = await headers();
  const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = headerList.get("user-agent");

  const result = await punchAttendance(
    {
      tenantId: user.tenantId,
      userId: employee.id,
      deviceId: sessionUser?.deviceId ?? null,
      ipAddress,
      userAgent,
    },
    {
      selfieUrl: parsed.data.selfieUrl || null,
      waived: parsed.data.waived,
      waiveReason: parsed.data.waiveReason || null,
      waivedById: parsed.data.waived ? user.id : null,
    }
  );

  if (!result.ok) return { error: result.error };

  if (parsed.data.waived) {
    await recordAudit({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      action: "attendance.selfie_waived",
      entity: "AttendanceEntry",
      entityId: result.entryId,
      description: `${user.name} registrou o ponto de ${employee.name} (${result.type}) sem selfie. Motivo: ${parsed.data.waiveReason}`,
    });
  }

  revalidatePath("/ponto");
  revalidatePath("/ponto/historico");
  revalidatePath("/ponto/painel");

  return { ok: true as const, entryId: result.entryId, type: result.type };
}

export type PunchStatus = {
  nextType: AttendanceEntryType | null;
  todaysEntries: EffectiveAttendanceEntry[];
};

/** Próxima marcação esperada e marcações de hoje do colaborador selecionado. */
export async function getPunchStatusAction(
  userId: string
): Promise<PunchStatus | { error: string }> {
  const user = await requireUser();

  const employee = await requireActiveTenantEmployee(user.tenantId, userId);
  if (!employee) {
    return { error: "Selecione um colaborador válido." };
  }

  const { start, end } = todayRange();
  const [nextType, todaysEntries] = await Promise.all([
    getNextExpectedForToday(user.tenantId, employee.id),
    listEffectiveEntries(user.tenantId, { userId: employee.id, from: start, to: end }),
  ]);

  return { nextType, todaysEntries };
}

export async function correctAttendanceEntryAction(input: CorrectAttendanceEntryInput) {
  const user = await requireUser();
  if (!canCorrectAttendance(user.role)) {
    return { error: "Seu perfil não tem permissão para corrigir marcações de ponto." };
  }

  const parsed = correctAttendanceEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await correctAttendanceEntry(user.tenantId, user.id, parsed.data);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    action: "attendance.correct",
    entity: "AttendanceEntry",
    entityId: parsed.data.entryId,
    description: `${user.name} corrigiu uma marcação de ponto. Motivo: ${parsed.data.reason}`,
  });

  revalidatePath("/ponto/painel");
  revalidatePath(`/ponto/colaborador/${result.userId}`);

  return { ok: true as const };
}

export async function addMissingAttendanceEntryAction(input: AddMissingAttendanceEntryInput) {
  const user = await requireUser();
  if (!canCorrectAttendance(user.role)) {
    return { error: "Seu perfil não tem permissão para lançar marcações de ponto." };
  }

  const parsed = addMissingAttendanceEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const employee = await requireActiveTenantEmployee(user.tenantId, parsed.data.userId);
  if (!employee) {
    return { error: "Selecione um colaborador válido." };
  }

  const result = await addMissingAttendanceEntry(user.tenantId, user.id, parsed.data);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    action: "attendance.add_missing",
    entity: "AttendanceEntry",
    entityId: result.entryId,
    description: `${user.name} lançou uma marcação faltante de ponto para ${employee.name}. Motivo: ${parsed.data.reason}`,
  });

  revalidatePath("/ponto/painel");
  revalidatePath(`/ponto/colaborador/${parsed.data.userId}`);

  return { ok: true as const };
}

export type ActiveEmployeeOption = { id: string; name: string; role: string };

/** Colaboradores ativos do tenant, para os filtros/seleção do painel de ponto. */
export async function listActiveEmployeesAction(): Promise<ActiveEmployeeOption[]> {
  const user = await requireUser();
  const employees = await prisma.user.findMany({
    where: { tenantId: user.tenantId, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return employees;
}
