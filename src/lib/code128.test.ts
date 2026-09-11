import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, Code128Error, code128Bars, encodeCode128 } from "./code128";

describe("tabela Code 128", () => {
  it("tem 107 símbolos distintos, cada um com 11 módulos (a parada com 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, index) => {
      const sum = [...pattern].reduce((total, digit) => total + Number(digit), 0);
      expect(sum).toBe(index === 106 ? 13 : 11);
    });
  });
});

describe("encodeCode128", () => {
  it("codifica o código interno com o prefixo em B e os dígitos em C", () => {
    // Start B, I N T -, Code C, 00 00 01, verificador 21, parada.
    expect(encodeCode128("INT-000001")).toEqual([104, 41, 46, 52, 13, 99, 0, 0, 1, 21, 106]);
  });

  it("usa o subconjunto C direto quando o texto é só dígitos em número par", () => {
    const values = encodeCode128("123456");
    expect(values[0]).toBe(105);
    expect(values.slice(1, 4)).toEqual([12, 34, 56]);
  });

  it("não troca de subconjunto por poucos dígitos", () => {
    const values = encodeCode128("AB12");
    expect(values).not.toContain(99);
  });

  it("recusa caractere fora do ASCII imprimível", () => {
    expect(() => encodeCode128("AÇÃO-1")).toThrow(Code128Error);
    expect(() => encodeCode128("")).toThrow(Code128Error);
  });
});

describe("code128Bars", () => {
  it("soma 11 módulos por símbolo e 13 da parada", () => {
    const symbols = encodeCode128("INT-000001").length;
    const { totalModules, bars } = code128Bars("INT-000001");
    expect(totalModules).toBe((symbols - 1) * 11 + 13);
    const last = bars[bars.length - 1];
    expect(last.x + last.width).toBe(totalModules);
  });
});
