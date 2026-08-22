import { describe, expect, it } from "vitest";
import { isCapinhaCategory, isPeliculaCategory, peliculaKitUnitDiscount } from "./seller-discount-rules";

describe("peliculaKitUnitDiscount", () => {
  it("desconta R$15 quando a película custa mais que isso", () => {
    expect(peliculaKitUnitDiscount(30)).toBe(15);
    expect(peliculaKitUnitDiscount(50)).toBe(15);
  });

  it("nunca desconta mais que o próprio preço do item", () => {
    expect(peliculaKitUnitDiscount(10)).toBe(10);
    expect(peliculaKitUnitDiscount(0)).toBe(0);
  });
});

describe("isPeliculaCategory", () => {
  it("reconhece a categoria Película", () => {
    expect(isPeliculaCategory("Película")).toBe(true);
  });

  it("não reconhece outras categorias, inclusive Capas", () => {
    expect(isPeliculaCategory("Capas")).toBe(false);
    expect(isPeliculaCategory("Fones")).toBe(false);
    expect(isPeliculaCategory(null)).toBe(false);
    expect(isPeliculaCategory(undefined)).toBe(false);
  });
});

describe("isCapinhaCategory (regressão)", () => {
  it("continua reconhecendo só Capas", () => {
    expect(isCapinhaCategory("Capas")).toBe(true);
    expect(isCapinhaCategory("Película")).toBe(false);
  });
});
