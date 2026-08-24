import { describe, expect, it } from "vitest";
import { computeProgressiveCommission, type CommissionTierInput } from "./commission-tiers";

const BRONZE_PRATA_OURO: CommissionTierInput[] = [
  { name: "Bronze", order: 0, minAmount: 0, maxAmount: 8000, percent: 1 },
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
