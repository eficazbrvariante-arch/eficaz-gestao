import type { AttendanceEntryType } from "@/generated/prisma/enums";

/**
 * Sequência fixa e diária do ciclo de ponto: Entrada → Saída para intervalo →
 * Retorno do intervalo → Saída/fim de expediente. O colaborador nunca escolhe
 * o tipo — só o próximo da sequência é aceito.
 */
const ATTENDANCE_CYCLE: AttendanceEntryType[] = [
  "CLOCK_IN",
  "BREAK_START",
  "BREAK_END",
  "CLOCK_OUT",
];

/**
 * Qual marcação o colaborador deve fazer agora, a partir das marcações já
 * feitas hoje. `null` quando o ciclo do dia já foi encerrado (já bateu
 * CLOCK_OUT) — não há próxima marcação esperada.
 *
 * Ordena por `occurredAt` antes de decidir, defensivo contra marcações que
 * cheguem fora de ordem (ex.: sincronização atrasada).
 */
export function getNextExpectedAttendanceType(
  todaysEntries: { type: AttendanceEntryType; occurredAt: Date }[]
): AttendanceEntryType | null {
  const sorted = [...todaysEntries].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );
  const lastType = sorted.at(-1)?.type;
  if (lastType === undefined) return ATTENDANCE_CYCLE[0];

  const lastIndex = ATTENDANCE_CYCLE.indexOf(lastType);
  const nextIndex = lastIndex + 1;
  return nextIndex < ATTENDANCE_CYCLE.length ? ATTENDANCE_CYCLE[nextIndex] : null;
}

export type ResolvedAttendanceValue = {
  type: AttendanceEntryType;
  occurredAt: Date;
  /** Se o valor exibido veio de uma correção, não do registro original. */
  corrected: boolean;
};

/**
 * Valor "efetivo" de uma marcação: o original, ou a correção mais recente por
 * `createdAt` quando existir. A `AttendanceEntry` em si nunca é sobrescrita —
 * isto só resolve o que exibir/usar em cálculo, em runtime.
 */
export function resolveEffectiveAttendanceEntry(
  entry: { type: AttendanceEntryType; occurredAt: Date },
  corrections: { newType: AttendanceEntryType; newOccurredAt: Date; createdAt: Date }[]
): ResolvedAttendanceValue {
  if (corrections.length === 0) {
    return { type: entry.type, occurredAt: entry.occurredAt, corrected: false };
  }
  const latest = corrections.reduce((a, b) => (b.createdAt.getTime() > a.createdAt.getTime() ? b : a));
  return { type: latest.newType, occurredAt: latest.newOccurredAt, corrected: true };
}

export type WorkedMinutesResult = {
  workedMinutes: number;
  /** Verdadeiro quando o dia ainda não foi encerrado (sem CLOCK_OUT). */
  open: boolean;
};

/**
 * Minutos efetivamente trabalhados num dia, a partir das marcações efetivas
 * (já resolvidas via `resolveEffectiveAttendanceEntry`). Desconta o intervalo
 * quando ele existe; se o dia ainda está em andamento, calcula até `now` e
 * sinaliza `open: true` em vez de fechar um total.
 */
export function computeWorkedMinutes(
  entries: { type: AttendanceEntryType; occurredAt: Date }[],
  now: Date = new Date()
): WorkedMinutesResult {
  const byType = new Map(entries.map((e) => [e.type, e.occurredAt]));
  const clockIn = byType.get("CLOCK_IN");
  if (!clockIn) return { workedMinutes: 0, open: false };

  const breakStart = byType.get("BREAK_START");
  const breakEnd = byType.get("BREAK_END");
  const clockOut = byType.get("CLOCK_OUT");
  const open = !clockOut;
  const end = clockOut ?? now;

  const firstSegmentEnd = breakStart ?? end;
  let ms = Math.max(0, firstSegmentEnd.getTime() - clockIn.getTime());

  if (breakEnd) {
    ms += Math.max(0, end.getTime() - breakEnd.getTime());
  }

  return { workedMinutes: Math.round(ms / 60000), open };
}

/** Formato curto para exibição: "8h 30min", "45min" ou "6h". */
export function formatWorkedMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}min`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}min`;
}

/** Jornada diária e intervalo padrão quando a empresa não configurou nada em `Tenant.attendanceSettings`. */
const DEFAULT_EXPECTED_DAILY_MINUTES = 8 * 60;
const DEFAULT_EXPECTED_BREAK_MINUTES = 60;

export type AttendanceSettings = {
  /** Jornada diária esperada, em minutos (padrão 8h). */
  dailyMinutes: number;
  /** Duração esperada do intervalo, em minutos (padrão 1h). */
  breakMinutes: number;
};

/**
 * Lê `Tenant.attendanceSettings` (JSON livre, formato `{ dailyMinutes,
 * breakMinutes }`) com defaults seguros pra qualquer valor ausente/inválido —
 * mesma convenção de `parseConvenioRules`/`parseFlashDealSchedule`, nunca
 * quebra por configuração incompleta.
 */
export function parseAttendanceSettings(value: unknown): AttendanceSettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    dailyMinutes:
      typeof raw.dailyMinutes === "number" && raw.dailyMinutes > 0
        ? raw.dailyMinutes
        : DEFAULT_EXPECTED_DAILY_MINUTES,
    breakMinutes:
      typeof raw.breakMinutes === "number" && raw.breakMinutes > 0
        ? raw.breakMinutes
        : DEFAULT_EXPECTED_BREAK_MINUTES,
  };
}

export type BreakBalance = {
  /** Duração real do intervalo, em minutos. */
  breakMinutes: number;
  /** Positivo = voltou antes do esperado (crédito); negativo = ficou a mais (débito). */
  deltaMinutes: number;
};

/**
 * Saldo do intervalo do dia — `null` quando ainda não tem os dois marcos
 * (saída e volta) pra comparar. Usa os mesmos horários efetivos (já
 * resolvidos por correção) que `computeWorkedMinutes`, nunca uma segunda
 * leitura própria dos dados brutos.
 */
export function computeBreakBalance(
  entries: { type: AttendanceEntryType; occurredAt: Date }[],
  expectedBreakMinutes: number = DEFAULT_EXPECTED_BREAK_MINUTES
): BreakBalance | null {
  const byType = new Map(entries.map((e) => [e.type, e.occurredAt]));
  const breakStart = byType.get("BREAK_START");
  const breakEnd = byType.get("BREAK_END");
  if (!breakStart || !breakEnd) return null;

  const breakMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);
  return { breakMinutes, deltaMinutes: expectedBreakMinutes - breakMinutes };
}

/**
 * Saldo do dia: `workedMinutes` já sai líquido do intervalo real (ver
 * `computeWorkedMinutes`), então esta conta sozinha já é "o positivo somado
 * com o negativo" — jornada mais longa vira crédito, intervalo mais longo ou
 * jornada mais curta vira débito, sem precisar somar as duas coisas à parte.
 * Positivo = crédito (ficou a mais no total do dia); negativo = débito.
 */
export function computeDailyBalanceMinutes(
  workedMinutes: number,
  expectedDailyMinutes: number = DEFAULT_EXPECTED_DAILY_MINUTES
): number {
  return workedMinutes - expectedDailyMinutes;
}

/** Formato com sinal pra saldo (crédito/débito): "+10min", "-1h 37min", "0min". */
export function formatBalanceMinutes(minutes: number): string {
  if (minutes === 0) return "0min";
  const sign = minutes > 0 ? "+" : "-";
  return `${sign}${formatWorkedMinutes(Math.abs(minutes))}`;
}

export const ATTENDANCE_TYPE_LABELS: Record<AttendanceEntryType, string> = {
  CLOCK_IN: "Entrada",
  BREAK_START: "Saída para intervalo",
  BREAK_END: "Retorno do intervalo",
  CLOCK_OUT: "Saída / fim de expediente",
};

export type TodayAttendanceStatus = "NOT_STARTED" | "WORKING" | "ON_BREAK" | "FINISHED";

export const TODAY_STATUS_LABELS: Record<TodayAttendanceStatus, string> = {
  NOT_STARTED: "Ainda não entrou",
  WORKING: "Presente",
  ON_BREAK: "Em intervalo",
  FINISHED: "Encerrou o expediente",
};
