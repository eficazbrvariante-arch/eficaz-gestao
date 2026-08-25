function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type CommissionTierInput = {
  name: string;
  order: number;
  minAmount: number;
  /** `null` = sem teto (última faixa). */
  maxAmount: number | null;
  percent: number;
};

export type CommissionTierBreakdownRow = {
  name: string;
  minAmount: number;
  maxAmount: number | null;
  percent: number;
  /** Quanto do faturamento caiu dentro desta faixa (pode ser 0 se o vendedor não chegou nela). */
  amountInTier: number;
  /** `amountInTier * percent / 100`. */
  commission: number;
};

export type ProgressiveCommissionResult = {
  breakdown: CommissionTierBreakdownRow[];
  total: number;
};

/**
 * Cálculo progressivo por faixas — função central e pura (zero dependência,
 * inclusive de banco), usada pelo cálculo real do mês
 * (`commission-tier-service.ts`), pelo ranking e pelo simulador do Admin
 * (que roda no navegador, sem round-trip ao servidor, por importar direto
 * daqui). Cada faixa comissiona só a fatia do faturamento que cai dentro
 * dela (marginal/progressivo, nunca a alíquota da faixa mais alta sobre o
 * total inteiro).
 *
 * Exemplo do pedido: R$20.000 em faixas 0–8000@1% / 8000–14000@2% /
 * 14000+@2,8% → R$80 + R$120 + R$168 = R$368.
 */
export function computeProgressiveCommission(
  totalSales: number,
  tiers: CommissionTierInput[]
): ProgressiveCommissionResult {
  const sorted = [...tiers].sort((a, b) => a.order - b.order || a.minAmount - b.minAmount);
  const breakdown: CommissionTierBreakdownRow[] = sorted.map((tier) => {
    const upper = tier.maxAmount === null ? totalSales : Math.min(totalSales, tier.maxAmount);
    const amountInTier = round2(Math.max(0, upper - tier.minAmount));
    const commission = round2((amountInTier * tier.percent) / 100);
    return {
      name: tier.name,
      minAmount: tier.minAmount,
      maxAmount: tier.maxAmount,
      percent: tier.percent,
      amountInTier,
      commission,
    };
  });

  return { breakdown, total: round2(breakdown.reduce((sum, row) => sum + row.commission, 0)) };
}

export type TierProgress = {
  breakdown: CommissionTierBreakdownRow[];
  total: number;
  /** Faixa mais alta que o vendedor já preencheu (a última com `amountInTier > 0`); com zero vendido, a primeira faixa. */
  currentTier: CommissionTierInput;
  currentTierIndex: number;
  /** Faixa seguinte à atual, ou `null` quando já está na última (faixa "sem teto" atingida). */
  nextTier: CommissionTierInput | null;
  /** Quanto falta pra alcançar `nextTier`; `null` quando já está na última faixa. */
  amountToNextTier: number | null;
  /** Quanto já vendeu além do início da faixa mais alta — só relevante quando `nextTier` é `null`. */
  amountAboveTopTier: number;
};

/**
 * Progresso do vendedor nas faixas — em qual faixa está, quanto falta pra
 * próxima, quanto já vendeu acima da última. Reaproveita
 * `computeProgressiveCommission`: a "faixa atual" é sempre a mais alta com
 * fatia preenchida (`amountInTier > 0`) — no limite exato de uma faixa
 * (ex.: vendeu exatamente R$8.000 com Bronze até R$8.000), o valor do limite
 * já pertence à faixa de baixo, então ela continua sendo a "atual" até
 * passar do limite (R$8.000,01 já é a de cima) — coerente com "até R$X"
 * (inclusivo) vs. "acima de R$X" (exclusivo) descrito nas faixas.
 */
export function computeTierProgress(totalSales: number, tiers: CommissionTierInput[]): TierProgress {
  const sorted = [...tiers].sort((a, b) => a.order - b.order || a.minAmount - b.minAmount);
  const { breakdown, total } = computeProgressiveCommission(totalSales, sorted);

  let currentTierIndex = 0;
  breakdown.forEach((row, i) => {
    if (row.amountInTier > 0) currentTierIndex = i;
  });

  const currentTier = sorted[currentTierIndex];
  const nextTier = sorted[currentTierIndex + 1] ?? null;
  const amountToNextTier = nextTier ? round2(nextTier.minAmount - totalSales) : null;
  const amountAboveTopTier = nextTier ? 0 : round2(Math.max(0, totalSales - currentTier.minAmount));

  return { breakdown, total, currentTier, currentTierIndex, nextTier, amountToNextTier, amountAboveTopTier };
}
