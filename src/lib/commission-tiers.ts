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

/** Quanto falta pro vendedor entrar na próxima faixa (não a atual) — `null` se já está na última. */
export function nextTierGap(
  totalSales: number,
  tiers: CommissionTierInput[]
): { nextTier: CommissionTierInput; amountRemaining: number } | null {
  const sorted = [...tiers].sort((a, b) => a.order - b.order || a.minAmount - b.minAmount);
  const next = sorted.find((tier) => tier.minAmount > totalSales);
  if (!next) return null;
  return { nextTier: next, amountRemaining: round2(next.minAmount - totalSales) };
}
