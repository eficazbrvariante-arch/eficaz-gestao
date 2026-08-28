import { prisma } from "@/lib/prisma";
import { addDaysISO, formatISODate, periodRange, todayISO } from "@/lib/format";
import { computeWorkedMinutesForDay } from "@/modules/attendance/attendance-rules";
import { listEffectiveEntries, type EffectiveAttendanceEntry } from "@/modules/attendance/attendance-service";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** `YYYY-MM-DD` → meio-dia UTC, mesma convenção de `addDaysISO` — evita
 *  problemas de fuso na borda do dia ao gravar/ler uma data pura no banco. */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function dateToISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ajusta o início do período pra nunca reincluir dias já cobertos por um
 * pagamento por horas registrado antes (`coveredThrough` = fim do último
 * período já lançado, pendente ou pago) — evita contar de novo horas já
 * lançadas quando o admin amplia o período pra frente. `null` quando o
 * período pedido já está inteiramente coberto (nada de novo a pagar).
 */
export function clampPeriodToUnpaid(
  period: { from: string; to: string },
  coveredThrough: string | null
): { from: string; to: string } | null {
  if (!coveredThrough) return period;
  const effectiveFrom = period.from > coveredThrough ? period.from : addDaysISO(coveredThrough, 1);
  if (effectiveFrom > period.to) return null;
  return { from: effectiveFrom, to: period.to };
}

export type DayWorkedMinutes = {
  date: string;
  workedMinutes: number;
  /** Dia passado sem "saída" batida — marcação esquecida, não turno em
   *  andamento (isso só é normal em `date === hoje`). `workedMinutes` vem
   *  zerado quando `true`, nunca extrapolado até agora. */
  incomplete: boolean;
  /** `true` quando o dia ainda não tem "saída" batida — em `date === hoje`
   *  isso é normal (turno em andamento, `workedMinutes` extrapolado até
   *  agora); num dia passado, `open` também fica `true` mas junto com
   *  `incomplete`. Usado pra bloquear registrar pagamento com o dia de hoje
   *  ainda em aberto (ver `hasOpenToday`). */
  open: boolean;
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
      const { workedMinutes, incomplete, open } = computeWorkedMinutesForDay(sorted, date === todayKey, now);
      return { date, workedMinutes, incomplete, open };
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
  /** `true` quando o dia de hoje está dentro do período e ainda sem "saída"
   *  batida — turno em andamento. Bloqueia o registro (ver
   *  `registerHourlyPayment`): registrar agora congelaria o dia de hoje como
   *  já coberto, e as horas trabalhadas depois deste momento nunca mais
   *  entrariam em nenhum pagamento futuro (`coveredThrough` é por dia
   *  inteiro, não por horário). Bug real: pagamento registrado às 17:21 com
   *  o colaborador ainda trabalhando "comeu" as horas até a saída, batida só
   *  às 18:40. */
  hasOpenToday: boolean;
  /** Início realmente usado no cálculo — pode ser depois do `period.from`
   *  pedido, se parte do período já tinha pagamento registrado (ver
   *  `clampPeriodToUnpaid`). Igual a `period.from` quando nada foi ajustado. */
  effectiveFrom: string;
  /** Fim do último pagamento por horas já registrado (pendente ou pago)
   *  antes deste período, ou `null` se nunca houve um. Usado pra avisar o
   *  admin quando o total mostrado é menor que o período pedido porque
   *  parte já está lançada. */
  coveredThrough: string | null;
  /** `true` quando o período pedido inteiro já tinha pagamento registrado
   *  antes — não há nada novo pra pagar (`days`/`totalMinutes`/`amount`
   *  vêm zerados só por causa disso, não por falta de marcação no Ponto). */
  fullyCovered: boolean;
};

/**
 * Fim do último período de pagamento por horas já lançado (`HOURLY_PAYMENT`,
 * qualquer status — pendente já "gasta" as horas tanto quanto pago) pra este
 * colaborador. `null` se nunca registrou nenhum.
 */
async function getHourlyPaymentCoveredThrough(tenantId: string, userId: string): Promise<string | null> {
  const last = await prisma.employeeLedgerEntry.aggregate({
    where: { tenantId, userId, type: "HOURLY_PAYMENT", hourlyPeriodTo: { not: null } },
    _max: { hourlyPeriodTo: true },
  });
  return last._max.hourlyPeriodTo ? dateToISO(last._max.hourlyPeriodTo) : null;
}

/**
 * Prévia do pagamento por horas de um colaborador num período — soma as
 * horas já registradas no Ponto (nunca digitadas) e multiplica pelo valor
 * por hora configurado (`User.hourlyRate`). Usada tanto pra mostrar a
 * calculadora quanto, de novo, no momento de registrar o pagamento (nunca
 * confia num valor calculado no cliente).
 *
 * Nunca reconta dias que já viraram um lançamento anterior (pendente ou
 * pago): o início efetivo é ajustado pra depois do último período já
 * coberto, mesmo que o filtro escolhido na tela peça um período maior.
 */
export async function computeHourlyPaymentPreview(
  tenantId: string,
  userId: string,
  /** `YYYY-MM-DD`, inclusivo dos dois lados — mesmo formato de `resolvePeriod`. */
  period: { from: string; to: string }
): Promise<HourlyPaymentPreview> {
  const coveredThrough = await getHourlyPaymentCoveredThrough(tenantId, userId);
  const effectivePeriod = clampPeriodToUnpaid(period, coveredThrough);

  if (!effectivePeriod) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { hourlyRate: true } });
    return {
      hourlyRate: Number(user?.hourlyRate ?? 0),
      days: [],
      totalMinutes: 0,
      totalHours: 0,
      amount: 0,
      hasIncompleteDays: false,
      hasOpenToday: false,
      effectiveFrom: period.to,
      coveredThrough,
      fullyCovered: true,
    };
  }

  const { start, end } = periodRange(effectivePeriod.from, effectivePeriod.to);
  const [user, entries] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { hourlyRate: true } }),
    listEffectiveEntries(tenantId, { userId, from: start, to: end }),
  ]);

  const hourlyRate = Number(user?.hourlyRate ?? 0);
  const now = new Date();
  const days = sumWorkedMinutesByDay(entries, now);
  const totalMinutes = days.reduce((sum, day) => sum + day.workedMinutes, 0);
  const totalHours = round2(totalMinutes / 60);
  const amount = round2(totalHours * hourlyRate);
  const hasIncompleteDays = days.some((day) => day.incomplete);
  const hasOpenToday = days.some((day) => day.open && day.date === todayISO(now));

  return {
    hourlyRate,
    days,
    totalMinutes,
    totalHours,
    amount,
    hasIncompleteDays,
    hasOpenToday,
    effectiveFrom: effectivePeriod.from,
    coveredThrough,
    fullyCovered: false,
  };
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
  if (preview.hasOpenToday) {
    return {
      ok: false,
      error:
        "O expediente de hoje ainda está aberto (colaborador não bateu a saída) — espere ele bater a saída antes de registrar. Registrando agora, as horas trabalhadas depois deste momento nunca entrariam em nenhum pagamento futuro.",
    };
  }

  const transportAmount = round2(Math.max(0, input.transportAmount ?? 0));
  if (preview.fullyCovered && transportAmount <= 0) {
    return {
      ok: false,
      error: `Esse período já está todo coberto por pagamento(s) registrado(s) até ${formatISODate(preview.coveredThrough!)}.`,
    };
  }
  if (preview.totalMinutes <= 0 && transportAmount <= 0) {
    return { ok: false, error: "Nenhuma hora trabalhada registrada no Ponto nesse período." };
  }

  const totalAmount = round2(preview.amount + transportAmount);
  const description = [
    preview.totalMinutes > 0
      ? `${preview.totalHours}h × ${formatBRLNoSymbol(preview.hourlyRate)} (${formatISODate(preview.effectiveFrom)} a ${formatISODate(input.to)})`
      : null,
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
      ...(preview.fullyCovered
        ? {}
        : { hourlyPeriodFrom: isoToDate(preview.effectiveFrom), hourlyPeriodTo: isoToDate(input.to) }),
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

export type HourlyPaymentHistoryEntry = {
  id: string;
  /** `null` num lançamento antigo, de antes desta coluna existir. */
  from: string | null;
  to: string | null;
  amount: number;
  status: "PENDING" | "PAID";
  createdAt: Date;
  settledAt: Date | null;
  paidSelfieUrl: string | null;
};

/**
 * Histórico de pagamentos por horas já registrados de um colaborador, mais
 * recente primeiro — mostrado no fim do painel de Horas pra separar
 * visualmente o que já foi lançado (pendente ou pago) do cálculo do
 * período em aberto acima.
 */
export async function listHourlyPaymentHistory(
  tenantId: string,
  userId: string
): Promise<HourlyPaymentHistoryEntry[]> {
  const entries = await prisma.employeeLedgerEntry.findMany({
    where: { tenantId, userId, type: "HOURLY_PAYMENT" },
    select: {
      id: true,
      amount: true,
      status: true,
      createdAt: true,
      settledAt: true,
      paidSelfieUrl: true,
      hourlyPeriodFrom: true,
      hourlyPeriodTo: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return entries.map((entry) => ({
    id: entry.id,
    from: entry.hourlyPeriodFrom ? dateToISO(entry.hourlyPeriodFrom) : null,
    to: entry.hourlyPeriodTo ? dateToISO(entry.hourlyPeriodTo) : null,
    amount: Number(entry.amount),
    status: entry.status,
    createdAt: entry.createdAt,
    settledAt: entry.settledAt,
    paidSelfieUrl: entry.paidSelfieUrl,
  }));
}
