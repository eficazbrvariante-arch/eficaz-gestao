import { describe, expect, it } from "vitest";
import { computeProgressiveCommission, computeTierProgress, type CommissionTierInput } from "./commission-tiers";

const BRONZE_PRATA_OURO: CommissionTierInput[] = [
  { name: "Bronze", order: 0, minAmount: 0, maxAmount: 8000, percent: 1 },
  { name: "Prata", order: 1, minAmount: 8000, maxAmount: 14000, percent: 2 },
  { name: "Ouro", order: 2, minAmount: 14000, maxAmount: null, percent: 2.8 },
];

/** Faixas padrão do Ranking de Comissão (Bronze 1,5% / Prata 2% / Ouro 2,8%). */
const RANKING_TIERS: CommissionTierInput[] = [
  { name: "Bronze", order: 0, minAmount: 0, maxAmount: 8000, percent: 1.5 },
  { name: "Prata", order: 1, minAmount: 8000, maxAmount: 14000, percent: 2 },
  { name: "Ouro", order: 2, minAmount: 14000, maxAmount: null, percent: 2.8 },
];

describe("computeProgressiveCommission", () => {
  // Exemplo exato do pedido: R$20.000 → R$80 + R$120 + R$168 = R$368.
  it("calcula progressivamente, cada faixa só sobre a fatia dela (não a faixa mais alta sobre tudo)", () => {
    const result = computeProgressiveCommission(20000, BRONZE_PRATA_OURO);
    expect(result.breakdown).toEqual([
      { name: "Bronze", minAmount: 0, maxAmount: 8000, percent: 1, amountInTier: 8000, commission: 80 },
      { name: "Prata", minAmount: 8000, maxAmount: 14000, percent: 2, amountInTier: 6000, commission: 120 },
      { name: "Ouro", minAmount: 14000, maxAmount: null, percent: 2.8, amountInTier: 6000, commission: 168 },
    ]);
    expect(result.total).toBe(368);
  });

  it("vendedor dentro só da primeira faixa: faixas seguintes ficam zeradas, não negativas", () => {
    const result = computeProgressiveCommission(5000, BRONZE_PRATA_OURO);
    expect(result.breakdown.map((r) => r.amountInTier)).toEqual([5000, 0, 0]);
    expect(result.total).toBe(50);
  });

  it("exatamente no limite de uma faixa: o valor do limite entra na faixa de baixo, não na de cima", () => {
    const result = computeProgressiveCommission(8000, BRONZE_PRATA_OURO);
    expect(result.breakdown.map((r) => r.amountInTier)).toEqual([8000, 0, 0]);
    expect(result.total).toBe(80);
  });

  it("zero vendido: comissão zero, sem erro", () => {
    const result = computeProgressiveCommission(0, BRONZE_PRATA_OURO);
    expect(result.total).toBe(0);
    expect(result.breakdown.every((r) => r.amountInTier === 0)).toBe(true);
  });

  it("faixa única sem teto (comportamento de hoje, antes de configurar faixas novas) — equivale à alíquota fixa", () => {
    const singleTier: CommissionTierInput[] = [{ name: "Padrão", order: 0, minAmount: 0, maxAmount: null, percent: 2 }];
    expect(computeProgressiveCommission(20000, singleTier).total).toBe(400);
    expect(computeProgressiveCommission(0, singleTier).total).toBe(0);
  });

  it("ordena pelas faixas mesmo se vierem fora de ordem", () => {
    const outOfOrder = [BRONZE_PRATA_OURO[2], BRONZE_PRATA_OURO[0], BRONZE_PRATA_OURO[1]];
    expect(computeProgressiveCommission(20000, outOfOrder).total).toBe(368);
  });
});

describe("computeTierProgress", () => {
  // Faixas do Ranking de Comissão: Bronze até R$8.000 (1,5%), Prata acima de
  // R$8.000 até R$14.000 (2%), Ouro acima de R$14.000 (2,8%) — "até X" é
  // inclusivo (pertence à faixa de baixo), "acima de X" é exclusivo (só a
  // partir do primeiro centavo depois do limite).
  it.each([
    { sales: 0, tier: "Bronze", commission: 0, next: "Prata", toNext: 8000, above: 0 },
    { sales: 1000, tier: "Bronze", commission: 15, next: "Prata", toNext: 7000, above: 0 },
    { sales: 7999, tier: "Bronze", commission: 119.99, next: "Prata", toNext: 1, above: 0 },
    { sales: 8000, tier: "Bronze", commission: 120, next: "Prata", toNext: 0, above: 0 },
    { sales: 8001, tier: "Prata", commission: 120.02, next: "Ouro", toNext: 5999, above: 0 },
    { sales: 10000, tier: "Prata", commission: 160, next: "Ouro", toNext: 4000, above: 0 },
    { sales: 13999, tier: "Prata", commission: 239.98, next: "Ouro", toNext: 1, above: 0 },
    { sales: 14000, tier: "Prata", commission: 240, next: "Ouro", toNext: 0, above: 0 },
    { sales: 14001, tier: "Ouro", commission: 240.03, next: null, toNext: null, above: 1 },
    { sales: 20000, tier: "Ouro", commission: 408, next: null, toNext: null, above: 6000 },
    { sales: 24000, tier: "Ouro", commission: 520, next: null, toNext: null, above: 10000 },
    { sales: 30000, tier: "Ouro", commission: 688, next: null, toNext: null, above: 16000 },
  ])(
    "R$$sales → faixa $tier, comissão R$$commission, falta R$$toNext p/ $next",
    ({ sales, tier, commission, next, toNext, above }) => {
      const progress = computeTierProgress(sales, RANKING_TIERS);
      expect(progress.currentTier.name).toBe(tier);
      expect(progress.total).toBe(commission);
      expect(progress.nextTier?.name ?? null).toBe(next);
      expect(progress.amountToNextTier).toBe(toNext);
      expect(progress.amountAboveTopTier).toBe(above);
    }
  );

  it("zero faixa configurada além da única (fallback) — sem próxima faixa, sem quebrar", () => {
    const single: CommissionTierInput[] = [{ name: "Padrão", order: 0, minAmount: 0, maxAmount: null, percent: 2 }];
    const progress = computeTierProgress(5000, single);
    expect(progress.currentTier.name).toBe("Padrão");
    expect(progress.nextTier).toBeNull();
    expect(progress.amountToNextTier).toBeNull();
    expect(progress.total).toBe(100);
  });
});
