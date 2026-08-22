import { describe, expect, it } from "vitest";
import { isCapinhaCategory, isPeliculaCategory } from "./seller-discount-rules";

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
