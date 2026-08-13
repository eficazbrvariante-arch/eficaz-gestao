export type SellerDiscountRule = {
  /** Desconto máximo por unidade, em R$. */
  maxDiscountPerUnit: number;
  /** Preço mínimo por unidade, em R$ (decorre do desconto máximo — só informativo). */
  minPricePerUnit: number;
};

const CAPINHA_CATEGORY_NAME = "Capas";

/**
 * Desconto que o Vendedor pode aplicar sozinho, sem passar por Gerente —
 * exclusivo para as duas películas 3D de vidro (comum e privativa).
 * Identifica por nome + preço de catálogo exato (não só nome), porque a
 * mesma família de nome inclui modelos premium/kits com preço mais alto que
 * não devem entrar nesta regra. Gerente/Admin não passam por aqui — eles já
 * têm desconto livre em qualquer item (`canApplyDiscount`).
 */
export function getSellerDiscountRule(
  productName: string,
  unitPrice: number
): SellerDiscountRule | null {
  if (!/pel[íi]cula\s*3d/i.test(productName)) return null;

  const isPrivativa = /priv/i.test(productName);
  if (isPrivativa) {
    if (Math.abs(unitPrice - 40) > 0.01) return null;
    return { maxDiscountPerUnit: 20, minPricePerUnit: 20 };
  }
  if (Math.abs(unitPrice - 30) > 0.01) return null;
  return { maxDiscountPerUnit: 20, minPricePerUnit: 10 };
}

/** O desconto de película do Vendedor só é liberado com uma capinha no carrinho. */
export function isCapinhaCategory(categoryName: string | null | undefined): boolean {
  return categoryName === CAPINHA_CATEGORY_NAME;
}
