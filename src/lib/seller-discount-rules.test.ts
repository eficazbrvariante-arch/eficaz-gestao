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

describe("isCapinhaCategory", () => {
  it("continua reconhecendo a categoria Capas, em qualquer preço", () => {
    expect(isCapinhaCategory({ categoryName: "Capas", name: "Capa qualquer", unitPrice: 999 })).toBe(true);
    expect(isCapinhaCategory({ categoryName: "Película", name: "Película 3D", unitPrice: 30 })).toBe(false);
  });

  // Bug real: "Capa space iPhone 17 Pro" a R$30 não estava na categoria
  // "Capas" (catálogo inconsistente) e a trava de desconto da película não
  // liberava — precisa reconhecer pelo nome + preço mesmo fora da categoria.
  it("reconhece fora da categoria Capas quando o nome tem capa/capinha a R$30", () => {
    expect(isCapinhaCategory({ categoryName: "Acessórios", name: "Capa space iPhone 17 Pro", unitPrice: 30 })).toBe(
      true
    );
    expect(isCapinhaCategory({ categoryName: null, name: "Capinha Anti-impacto Redmi 12", unitPrice: 30 })).toBe(
      true
    );
  });

  it("não reconhece pelo nome fora do preço de R$30", () => {
    expect(isCapinhaCategory({ categoryName: "Acessórios", name: "Capa Premium iPhone 17 Pro", unitPrice: 80 })).toBe(
      false
    );
  });

  it("não reconhece produto sem 'capa'/'capinha' no nome", () => {
    expect(isCapinhaCategory({ categoryName: "Acessórios", name: "Suporte de carro", unitPrice: 30 })).toBe(false);
  });
});
