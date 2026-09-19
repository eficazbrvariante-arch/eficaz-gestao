/**
 * Acréscimo do Crédito Eficaz — conta pura, sem banco, usada IGUAL no
 * servidor (`sale-service.ts`, `repair-payment-service.ts`) e na tela (PDV,
 * OS): o valor que o operador mostra ao cliente antes do PIN tem que ser
 * exatamente o que vira obrigação. Decisão do dono: o acréscimo incide só
 * sobre a parte paga no crédito, nunca sobre o que o cliente paga em
 * dinheiro/Pix/cartão na mesma compra.
 */

export const DEFAULT_CREDITO_EFICAZ_SURCHARGE_PERCENT = 10;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Acréscimo em R$ sobre `creditoEficazAmount` (a parte no crédito, sem acréscimo). */
export function computeCreditoEficazSurcharge(creditoEficazAmount: number, percent: number): number {
  if (!(creditoEficazAmount > 0) || !(percent > 0)) return 0;
  return round2((creditoEficazAmount * percent) / 100);
}

/**
 * Divide `total` em `count` parcelas iguais; a última absorve o
 * arredondamento, pra soma bater sempre com `total` ao centavo.
 */
export function splitCreditoEficazInstallments(total: number, count: number): number[] {
  const installmentCount = Math.max(1, Math.floor(count));
  const perInstallment = round2(total / installmentCount);
  return Array.from({ length: installmentCount }, (_, index) =>
    index === installmentCount - 1 ? round2(total - perInstallment * (installmentCount - 1)) : perInstallment
  );
}

/** "10%", "7,5%" — como o percentual aparece na tela e nos termos. */
export function formatSurchargePercent(percent: number): string {
  return `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export type CreditoEficazInstallment = {
  number: number;
  amount: number;
  dueDate: Date;
};

/**
 * Plano de parcelas de uma compra no Crédito Eficaz — conta pura, igual no
 * servidor e na tela, mesmo motivo de `computeCreditoEficazSurcharge`: o
 * cliente precisa ver antes de confirmar exatamente o que vai virar
 * obrigação. `intervalDays = 30` e `count = 2` é o "30 + 60" combinado com
 * o convênio; `count = 1` reproduz o comportamento de sempre (uma
 * obrigação só).
 */
export function buildCreditoEficazInstallments(
  total: number,
  count: number,
  intervalDays: number,
  from: Date
): CreditoEficazInstallment[] {
  const amounts = splitCreditoEficazInstallments(total, count);
  return amounts.map((amount, index) => ({
    number: index + 1,
    amount,
    // Meio-dia, mesma convenção de `nextOccurrenceOfDay` — evita que
    // fuso/horário de verão empurre o vencimento pro dia anterior.
    dueDate: addDaysAtNoon(from, (index + 1) * Math.max(1, Math.floor(intervalDays))),
  }));
}

function addDaysAtNoon(from: Date, days: number): Date {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 12, 0, 0);
  return date;
}
