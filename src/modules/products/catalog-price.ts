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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Preço unitário efetivo de um produto (com variante, se houver) — fonte
 * única usada tanto para gravar o pedido (`createOrder`) quanto para
 * revalidar o preço exibido no carrinho/checkout (`getCartPricingAction`).
 * Nunca duplique esta conta em outro lugar.
 *
 * Prioridade: Oferta Relâmpago do dia (`flashOverride`, se bater com este
 * produto) > promoção "evergreen" do produto, só se `isPromoActive` > preço
 * de venda normal. Depois soma o ajuste da variante, se houver.
 */
export function resolveEffectiveUnitPrice(
  product: {
    salePrice: number;
    promoPrice: number | null;
    promoStartedAt: Date | null;
    promoEndsAt: Date | null;
  },
  variantPriceAdjustment: number,
  flashOverride: { promoPrice: number } | null,
  now: Date = new Date()
): number {
  const promoActive = isPromoActive(product.promoPrice, product.promoStartedAt, product.promoEndsAt, now);
  const basePrice = flashOverride
    ? flashOverride.promoPrice
    : promoActive
      ? product.promoPrice!
      : product.salePrice;
  return round2(basePrice + variantPriceAdjustment);
}
