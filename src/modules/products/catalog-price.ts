/**
 * Preço que o cliente efetivamente paga: o promocional quando existir,
 * senão o preço de venda.
 *
 * Este valor é gravado na coluna derivada `Product.catalogPrice` em toda escrita
 * de produto, para o catálogo poder ordenar e filtrar por preço real diretamente
 * no banco (sem isso, "menor preço" ignoraria as promoções).
 *
 * Use esta função em **todos** os caminhos que gravam preço — cadastro, edição
 * e importação CSV — para a coluna nunca sair de sincronia.
 */
export function computeCatalogPrice(
  salePrice: number,
  promoPrice: number | null | undefined
): number {
  return promoPrice ?? salePrice;
}
