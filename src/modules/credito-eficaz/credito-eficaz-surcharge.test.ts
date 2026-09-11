import { describe, expect, it } from "vitest";
import {
  computeCreditoEficazSurcharge,
  formatSurchargePercent,
  splitCreditoEficazInstallments,
} from "./credito-eficaz-surcharge";

describe("computeCreditoEficazSurcharge", () => {
  it("10% sobre a parte no crédito", () => {
    expect(computeCreditoEficazSurcharge(60, 10)).toBe(6);
    expect(computeCreditoEficazSurcharge(100, 10)).toBe(10);
  });

  it("arredonda ao centavo", () => {
    expect(computeCreditoEficazSurcharge(33.33, 10)).toBe(3.33);
    expect(computeCreditoEficazSurcharge(19.99, 7.5)).toBe(1.5);
  });

  it("sem parte no crédito ou com 0% não há acréscimo", () => {
    expect(computeCreditoEficazSurcharge(0, 10)).toBe(0);
    expect(computeCreditoEficazSurcharge(50, 0)).toBe(0);
    expect(computeCreditoEficazSurcharge(-5, 10)).toBe(0);
  });
});

describe("splitCreditoEficazInstallments", () => {
  it("divide igual e a última absorve o arredondamento", () => {
    expect(splitCreditoEficazInstallments(110, 3)).toEqual([36.67, 36.67, 36.66]);
    expect(splitCreditoEficazInstallments(66, 1)).toEqual([66]);
  });

  it("a soma sempre bate com o total", () => {
    for (const [total, count] of [
      [99.99, 3],
      [10, 3],
      [1234.56, 7],
    ] as const) {
      const parts = splitCreditoEficazInstallments(total, count);
      const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
      expect(sum).toBe(total);
      expect(parts).toHaveLength(count);
    }
  });
});

describe("formatSurchargePercent", () => {
  it("formata em pt-BR", () => {
    expect(formatSurchargePercent(10)).toBe("10%");
    expect(formatSurchargePercent(7.5)).toBe("7,5%");
  });
});
