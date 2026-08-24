const TIMEZONE = "America/Sao_Paulo";

export type DecimalLike = number | string | { toString(): string };

/** Formata um valor monetário no padrão brasileiro: R$ 1.234,56 */
export function formatBRL(value: DecimalLike) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Data e hora no fuso da loja: 29/07/2026 17:06 */
export function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Apenas a data no fuso da loja: 29/07/2026 */
export function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: TIMEZONE });
}

/**
 * Início e fim do dia de hoje no fuso da loja, como instantes UTC —
 * usado para filtrar vendas "de hoje" sem depender do fuso do servidor.
 */
export function todayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const start = new Date(`${parts}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Data de hoje no fuso da loja, no formato `YYYY-MM-DD`. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Soma (ou subtrai) dias de uma data `YYYY-MM-DD`, devolvendo no mesmo formato. */
export function addDaysISO(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Primeiro dia do mês de uma data `YYYY-MM-DD`. */
export function startOfMonthISO(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

/** Primeiro dia do mês atual, no fuso da loja, formato `YYYY-MM-DD`. */
export function currentMonthStartISO(now = new Date()) {
  return startOfMonthISO(todayISO(now));
}

/** Dia 1 do mês seguinte a um mês `YYYY-MM-01` (ou qualquer data — só o ano/mês importam). */
export function nextMonthStartISO(monthStartISO: string) {
  const [year, month] = monthStartISO.slice(0, 7).split("-").map(Number);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return `${String(next.y).padStart(4, "0")}-${String(next.m).padStart(2, "0")}-01`;
}

/**
 * Início (dia 1) e início do mês seguinte de um mês `YYYY-MM-01`, como
 * instantes reais — usado pra faturamento mensal (ex.: comissão por faixa
 * progressiva). Mesmo deslocamento fixo `-03:00` de `periodRange`.
 */
export function monthRange(monthStartISO: string) {
  const start = new Date(`${monthStartISO}T00:00:00-03:00`);
  const end = new Date(`${nextMonthStartISO(monthStartISO)}T00:00:00-03:00`);
  return { start, end };
}

/**
 * Converte um período `YYYY-MM-DD` (inclusivo nas duas pontas) em instantes UTC.
 *
 * O deslocamento fixo de -03:00 vale o ano todo: o Brasil não usa mais
 * horário de verão desde 2019.
 */
export function periodRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00-03:00`);
  const end = new Date(`${addDaysISO(to, 1)}T00:00:00-03:00`);
  return { start, end };
}

/** Formata `YYYY-MM-DD` como `dd/mm/aaaa`. */
export function formatISODate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Iniciais do nome (primeiro + segundo nome), em maiúsculas: "João da Silva" → "JS". */
export function nameInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Valor para um `<input type="datetime-local">`, no fuso da loja: `YYYY-MM-DDTHH:mm`. */
export function toDateTimeLocalValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
