import { describe, expect, it } from "vitest";
import { isPromoActive, resolveEffectiveUnitPrice } from "./catalog-price";

describe("isPromoActive", () => {
  it("falso quando não há preço promocional", () => {
    expect(isPromoActive(null, null, null)).toBe(false);
  });

  it("verdadeiro sem janela de datas definida", () => {
    expect(isPromoActive(80, null, null)).toBe(true);
  });

  it("falso antes do início", () => {
    const now = new Date("2026-08-05T12:00:00-03:00");
    expect(isPromoActive(80, new Date("2026-08-10T00:00:00-03:00"), null, now)).toBe(false);
  });

  it("falso depois do fim", () => {
    const now = new Date("2026-08-05T12:00:00-03:00");
    expect(isPromoActive(80, null, new Date("2026-08-01T00:00:00-03:00"), now)).toBe(false);
  });

  it("verdadeiro dentro da janela", () => {
    const now = new Date("2026-08-05T12:00:00-03:00");
    expect(
      isPromoActive(80, new Date("2026-08-01T00:00:00-03:00"), new Date("2026-08-10T00:00:00-03:00"), now)
    ).toBe(true);
  });
});

describe("resolveEffectiveUnitPrice — fonte única de preço, usada por createOrder e por getCartPricingAction", () => {
  const baseProduct = { salePrice: 100, promoPrice: null as number | null, promoStartedAt: null as Date | null, promoEndsAt: null as Date | null };

  it("sem nenhuma promoção, usa o preço de venda", () => {
    expect(resolveEffectiveUnitPrice(baseProduct, 0, null)).toBe(100);
  });

  it("promoção normal ativa (sem janela) usa o preço promocional", () => {
    expect(resolveEffectiveUnitPrice({ ...baseProduct, promoPrice: 80 }, 0, null)).toBe(80);
  });

  it("promoção normal já expirada é ignorada — nunca cobra um preço promocional velho", () => {
    const now = new Date("2026-08-05T12:00:00-03:00");
    const product = { ...baseProduct, promoPrice: 80, promoEndsAt: new Date("2026-08-01T00:00:00-03:00") };
    expect(resolveEffectiveUnitPrice(product, 0, null, now)).toBe(100);
  });

  it("promoção normal que ainda não começou é ignorada", () => {
    const now = new Date("2026-08-05T12:00:00-03:00");
    const product = { ...baseProduct, promoPrice: 80, promoStartedAt: new Date("2026-08-10T00:00:00-03:00") };
    expect(resolveEffectiveUnitPrice(product, 0, null, now)).toBe(100);
  });

  it("a Oferta Relâmpago do dia tem prioridade sobre a promoção normal do produto", () => {
    const product = { ...baseProduct, promoPrice: 80 };
    expect(resolveEffectiveUnitPrice(product, 0, { promoPrice: 30 })).toBe(30);
  });

  it("a Oferta Relâmpago vale mesmo sem nenhuma promoção normal cadastrada", () => {
    expect(resolveEffectiveUnitPrice(baseProduct, 0, { promoPrice: 30 })).toBe(30);
  });

  it("soma o ajuste de variante em cima do preço de venda normal", () => {
    expect(resolveEffectiveUnitPrice(baseProduct, 15, null)).toBe(115);
  });

  it("soma o ajuste de variante em cima do preço da Oferta Relâmpago", () => {
    const product = { ...baseProduct, promoPrice: 80 };
    expect(resolveEffectiveUnitPrice(product, 10, { promoPrice: 30 })).toBe(40);
  });

  it("arredonda o resultado para duas casas decimais", () => {
    expect(resolveEffectiveUnitPrice({ ...baseProduct, salePrice: 33.333 }, 0, null)).toBe(33.33);
  });
});
