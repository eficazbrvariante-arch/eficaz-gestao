import { prisma } from "@/lib/prisma";
import { formatISODate, periodRange, todayISO } from "@/lib/format";
import { computeWorkedMinutesForDay } from "@/modules/attendance/attendance-rules";
import { listEffectiveEntries, type EffectiveAttendanceEntry } from "@/modules/attendance/attendance-service";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type DayWorkedMinutes = {
  date: string;
  workedMinutes: number;
  /** Dia passado sem "saída" batida — marcação esquecida, não turno em
   *  andamento (isso só é normal em `date === hoje`). `workedMinutes` vem
   *  zerado quando `true`, nunca extrapolado até agora. */
  incomplete: boolean;
};

/**
 * Agrupa marcações efetivas por dia (`YYYY-MM-DD`) e soma os minutos
 * trabalhados de cada um (`computeWorkedMinutes`) — função pura, sem banco,
 * pra poder testar a soma do período isoladamente do fetch das marcações.
 * Mesmo agrupamento usado em `/ponto/colaborador/[userId]`.
 */
export function sumWorkedMinutesByDay(
  entries: EffectiveAttendanceEntry[],
  now: Date = new Date()
): DayWorkedMinutes[] {
  const todayKey = todayISO(now);
  const byDay = new Map<string, EffectiveAttendanceEntry[]>();
  for (const entry of entries) {
    const key = todayISO(entry.occurredAt);
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, dayEntries]) => {
      const sorted = [...dayEntries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      const { workedMinutes, incomplete } = computeWorkedMinutesForDay(sorted, date === todayKey, now);
      return { date, workedMinutes, incomplete };
    });
}

export type HourlyPaymentPreview = {
  hourlyRate: number;
  days: DayWorkedMinutes[];
  totalMinutes: number;
  /** Horas em decimal (ex.: 7.5), já arredondado a 2 casas. */
  totalHours: number;
  amount: number;
  /** `true` se algum dia do período está com marcação incompleta (falta
   *  "saída") — o total já exclui esses dias, mas registrar o pagamento
   *  assim mesmo pagaria a menos sem avisar; bloqueado até corrigir. */
  hasIncompleteDays: boolean;
};

/**
 * Prévia do pagamento por horas de um colaborador num período — soma as
 * horas já registradas no Ponto (nunca digitadas) e multiplica pelo valor
 * por hora configurado (`User.hourlyRate`). Usada tanto pra mostrar a
 * calculadora quanto, de novo, no momento de registrar o pagamento (nunca
 * confia num valor calculado no cliente).
 */
export async function computeHourlyPaymentPreview(
  tenantId: string,
  userId: string,
  /** `YYYY-MM-DD`, inclusivo dos dois lados — mesmo formato de `resolvePeriod`. */
  period: { from: string; to: string }
): Promise<HourlyPaymentPreview> {
  const { start, end } = periodRange(period.from, period.to);
  const [user, entries] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { hourlyRate: true } }),
    listEffectiveEntries(tenantId, { userId, from: start, to: end }),
  ]);

  const hourlyRate = Number(user?.hourlyRate ?? 0);
  const days = sumWorkedMinutesByDay(entries);
  const totalMinutes = days.reduce((sum, day) => sum + day.workedMinutes, 0);
  const totalHours = round2(totalMinutes / 60);
  const amount = round2(totalHours * hourlyRate);
  const hasIncompleteDays = days.some((day) => day.incomplete);

  return { hourlyRate, days, totalMinutes, totalHours, amount, hasIncompleteDays };
}

export type RegisterHourlyPaymentResult =
  | { ok: true; id: string; amount: number }
  | { ok: false; error: string };

/**
 * Registra o pagamento por horas como um `EmployeeLedgerEntry` — recalcula a
 * prévia aqui dentro (nunca aceita o valor vindo do formulário), mesmo
 * princípio de `createSale` relendo preço do banco. `transportAmount`
 * (opcional) é um valor fixo à parte das horas — ex.: passagem — somado ao
 * mesmo lançamento, pra virar uma única confirmação/comprovante em vez de um
 * "Outro" separado que o colaborador poderia esquecer de conferir.
 */
export async function registerHourlyPayment(
  ctx: { tenantId: string; createdById: string },
  input: { userId: string; from: string; to: string; transportAmount?: number }
): Promise<RegisterHourlyPaymentResult> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, tenantId: ctx.tenantId },
    select: { id: true, hourlyRate: true },
  });
  if (!user) return { ok: false, error: "Colaborador não encontrado." };
  if (Number(user.hourlyRate) <= 0) {
    return { ok: false, error: "Configure o valor por hora deste colaborador antes de registrar." };
  }

  const preview = await computeHourlyPaymentPreview(ctx.tenantId, input.userId, {
    from: input.from,
    to: input.to,
  });
  if (preview.hasIncompleteDays) {
    return {
      ok: false,
      error:
        "Tem dia com marcação incompleta no período (falta bater saída) — corrija no Ponto antes de registrar o pagamento.",
    };
  }

  const transportAmount = round2(Math.max(0, input.transportAmount ?? 0));
  if (preview.totalMinutes <= 0 && transportAmount <= 0) {
    return { ok: false, error: "Nenhuma hora trabalhada registrada no Ponto nesse período." };
  }

  const totalAmount = round2(preview.amount + transportAmount);
  const description = [
    `${preview.totalHours}h × ${formatBRLNoSymbol(preview.hourlyRate)} (${formatISODate(input.from)} a ${formatISODate(input.to)})`,
    transportAmount > 0 ? `Passagem ${formatBRLNoSymbol(transportAmount)}` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const created = await prisma.employeeLedgerEntry.create({
    data: {
      tenantId: ctx.tenantId,
      userId: input.userId,
      type: "HOURLY_PAYMENT",
      amount: totalAmount,
      description,
      createdById: ctx.createdById,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id, amount: totalAmount };
}

function formatBRLNoSymbol(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function setHourlyRate(tenantId: string, userId: string, hourlyRate: number) {
  const result = await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data: { hourlyRate: round2(hourlyRate) },
  });
  return result.count > 0;
}
