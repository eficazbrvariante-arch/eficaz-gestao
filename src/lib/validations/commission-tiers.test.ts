import { describe, expect, it } from "vitest";
import { saveCommissionTiersSchema } from "./commission-tiers";

const baseTier = { name: "Bronze", order: 0, minAmount: 0, maxAmount: 8000, percent: 1, active: true };

describe("saveCommissionTiersSchema", () => {
  // Regressão: `z.union([money, z.null()])` deixava `money` (que faz
  // `z.coerce.number()`, convertendo "" e `null` em 0 sem erro) "vencer"
  // antes de `z.null()` ser tentado — a última faixa ("sem teto") acabava
  // salva com `maxAmount: 0` em vez de `null`, zerando a comissão dela.
  it("campo 'Até' vazio na última faixa vira maxAmount null, não 0", () => {
    const parsed = saveCommissionTiersSchema.safeParse({
      tiers: [baseTier, { name: "Ouro", order: 1, minAmount: 8000, maxAmount: "", percent: 2, active: true }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tiers[1].maxAmount).toBeNull();
    }
  });

  it("campo 'Até' undefined na última faixa também vira null", () => {
    const parsed = saveCommissionTiersSchema.safeParse({
      tiers: [baseTier, { name: "Ouro", order: 1, minAmount: 8000, maxAmount: undefined, percent: 2, active: true }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tiers[1].maxAmount).toBeNull();
    }
  });

  it("faixa que não é a última precisa de um valor final (não pode ficar sem teto)", () => {
    const parsed = saveCommissionTiersSchema.safeParse({
      tiers: [
        { ...baseTier, maxAmount: "" },
        { name: "Ouro", order: 1, minAmount: 8000, maxAmount: null, percent: 2, active: true },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
