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

/**
 * Se a promoção do produto (`promoPrice`/`promoStartedAt`/`promoEndsAt`) vale
 * agora. Única regra de janela de promoção do sistema — usada tanto pra
 * decidir o que mostrar na vitrine quanto pra decidir o que cobrar no
 * checkout, pra nunca cobrar (ou exibir) um preço promocional que já
 * expirou ou ainda não começou.
 */
export function isPromoActive(
  promoPrice: number | null | undefined,
  promoStartedAt: Date | null | undefined,
  promoEndsAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (promoPrice === null || promoPrice === undefined) return false;
  if (promoStartedAt && promoStartedAt.getTime() > now.getTime()) return false;
  if (promoEndsAt && promoEndsAt.getTime() <= now.getTime()) return false;
  return true;
}
