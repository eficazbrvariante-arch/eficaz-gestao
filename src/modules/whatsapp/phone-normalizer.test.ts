import { describe, expect, it } from "vitest";
import { normalizeToE164, phoneNumbersMatch } from "./phone-normalizer";

describe("normalizeToE164", () => {
  it("mantém um celular já no formato canônico (13 dígitos)", () => {
    expect(normalizeToE164("5511999998888")).toBe("5511999998888");
  });

  it("mantém um fixo já no formato canônico (12 dígitos)", () => {
    expect(normalizeToE164("551133334444")).toBe("551133334444");
  });

  it("insere o nono dígito que falta em celular sem ele (quirk conhecido da Meta)", () => {
    expect(normalizeToE164("551199998888")).toBe("5511999998888");
  });

  it("não insere o nono dígito num fixo de 12 dígitos", () => {
    expect(normalizeToE164("551133334444")).toBe("551133334444");
  });

  it("por padrão não assume Brasil quando falta o DDI", () => {
    expect(normalizeToE164("11999998888")).toBe("11999998888");
  });

  it("assume Brasil quando pedido explicitamente e o texto não tem DDI (celular)", () => {
    expect(normalizeToE164("11999998888", { assumeBrazilIfNoCountryCode: true })).toBe("5511999998888");
  });

  it("assume Brasil quando pedido explicitamente e o texto não tem DDI (fixo, sem DDI e sem nono dígito)", () => {
    expect(normalizeToE164("1133334444", { assumeBrazilIfNoCountryCode: true })).toBe("551133334444");
  });

  it("lida com formatação livre (parênteses, espaço, hífen)", () => {
    expect(normalizeToE164("(11) 99999-8888", { assumeBrazilIfNoCountryCode: true })).toBe("5511999998888");
  });

  it("não mexe em números de outros países", () => {
    expect(normalizeToE164("14155552671")).toBe("14155552671");
  });

  it("retorna null para texto sem dígitos suficientes", () => {
    expect(normalizeToE164("123")).toBeNull();
    expect(normalizeToE164("abc")).toBeNull();
  });
});

describe("phoneNumbersMatch", () => {
  it("reconhece o mesmo número em formatos diferentes como igual", () => {
    expect(phoneNumbersMatch("5511999998888", "(11) 99999-8888", { assumeBrazilIfNoCountryCode: true })).toBe(true);
  });

  it("reconhece o mesmo número com/sem o nono dígito como igual", () => {
    expect(phoneNumbersMatch("5511999998888", "551199998888")).toBe(true);
  });

  it("não confunde números diferentes", () => {
    expect(phoneNumbersMatch("5511999998888", "5511988887777")).toBe(false);
  });
});
