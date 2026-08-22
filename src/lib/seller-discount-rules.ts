const CAPINHA_CATEGORY_NAME = "Capas";
const PELICULA_CATEGORY_NAME = "Película";

/**
 * Desconto automático (R$) por unidade de película vendida junto com pelo
 * menos uma capinha na mesma nota — regra da loja, não escolha de quem
 * vende: aparece sozinho assim que há capinha + película juntas, sem
 * limite pela quantidade de capinhas (uma só libera pra todas as películas
 * da venda), e some se a capinha sair do carrinho. Vale pra toda película do
 * catálogo (3D comum, privativa, hidrogel — qualquer uma), nunca mais que o
 * preço do item (uma película mais barata que isso fica de graça, não com
 * total negativo).
 */
export const PELICULA_KIT_DISCOUNT_PER_UNIT = 15;

/** Desconto automático de uma unidade de película nesse preço — nunca ultrapassa o próprio valor do item. */
export function peliculaKitUnitDiscount(unitPrice: number): number {
  return Math.min(PELICULA_KIT_DISCOUNT_PER_UNIT, unitPrice);
}

/** Trava a regra de kit (e a Proteção Eficaz) a uma capinha na mesma venda. */
export function isCapinhaCategory(categoryName: string | null | undefined): boolean {
  return categoryName === CAPINHA_CATEGORY_NAME;
}

/**
 * Toda película do catálogo (hidrogel, 3D comum, privativa) — usada tanto
 * pelo desconto automático de kit acima quanto pela elegibilidade da
 * Proteção Eficaz, que também vale pra qualquer película da categoria,
 * desde que a venda tenha uma capinha junto.
 */
export function isPeliculaCategory(categoryName: string | null | undefined): boolean {
  return categoryName === PELICULA_CATEGORY_NAME;
}
