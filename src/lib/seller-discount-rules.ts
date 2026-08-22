export type SellerDiscountRule = {
  /** Desconto máximo por unidade, em R$. */
  maxDiscountPerUnit: number;
  /** Preço mínimo por unidade, em R$ (decorre do desconto máximo — só informativo). */
  minPricePerUnit: number;
};

const CAPINHA_CATEGORY_NAME = "Capas";
const PELICULA_CATEGORY_NAME = "Película";

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

/**
 * Toda película do catálogo (hidrogel, 3D comum, privativa — não só as duas
 * elegíveis ao desconto de segurança do Vendedor, ver `getSellerDiscountRule`
 * acima). Usada pra elegibilidade da Proteção Eficaz, que vale pra qualquer
 * película da categoria, desde que a venda também tenha uma capinha.
 */
export function isPeliculaCategory(categoryName: string | null | undefined): boolean {
  return categoryName === PELICULA_CATEGORY_NAME;
}

export type SellerDiscountBudgetLine = {
  key: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

/**
 * Reparte o orçamento de desconto do Vendedor pela quantidade de capinhas na
 * venda — cada unidade de capinha libera o desconto de exatamente uma
 * unidade de película (transparente ou privativa, é o mesmo saldo
 * compartilhado; a distinção de regra é só o preço/teto de cada uma). Uma
 * capinha + duas películas = desconto só numa das duas, nunca nas duas ao
 * mesmo tempo. Repartido na ordem das linhas (primeira a entrar leva o
 * saldo primeiro); usado tanto no PDV (limite ao vivo) quanto no servidor
 * (validação final, ver `sale-service.ts`) — precisa dar o mesmo resultado
 * nos dois lugares.
 */
export function allocateSellerDiscountBudget(
  lines: SellerDiscountBudgetLine[],
  capinhaUnits: number
): Map<string, number> {
  const allocation = new Map<string, number>();
  let remaining = capinhaUnits;
  for (const line of lines) {
    if (remaining <= 0) break;
    const rule = getSellerDiscountRule(line.name, line.unitPrice);
    if (!rule) continue;
    const allocated = Math.min(line.quantity, remaining);
    if (allocated > 0) {
      allocation.set(line.key, allocated);
      remaining -= allocated;
    }
  }
  return allocation;
}
