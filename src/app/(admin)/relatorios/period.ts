import { addDaysISO, startOfMonthISO, todayISO } from "@/lib/format";
import type { Period } from "@/modules/reports/report-service";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lê o período dos parâmetros da URL, caindo no mês atual quando ausente
 * ou inválido. Garante `from <= to` para o usuário não conseguir inverter
 * as datas e receber um relatório vazio sem explicação.
 */
export function resolvePeriod(searchParams: { de?: string; ate?: string }): Period {
  const today = todayISO();
  const from = ISO_DATE.test(searchParams.de ?? "")
    ? searchParams.de!
    : startOfMonthISO(today);
  const to = ISO_DATE.test(searchParams.ate ?? "") ? searchParams.ate! : today;

  return from > to ? { from: to, to: from } : { from, to };
}

export type PeriodShortcut = { label: string; from: string; to: string };

/** Atalhos de período mais usados no dia a dia da loja. */
export function periodShortcuts(): PeriodShortcut[] {
  const today = todayISO();
  return [
    { label: "Hoje", from: today, to: today },
    { label: "Ontem", from: addDaysISO(today, -1), to: addDaysISO(today, -1) },
    { label: "Últimos 7 dias", from: addDaysISO(today, -6), to: today },
    { label: "Últimos 30 dias", from: addDaysISO(today, -29), to: today },
    { label: "Este mês", from: startOfMonthISO(today), to: today },
  ];
}
