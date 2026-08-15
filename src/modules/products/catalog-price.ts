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
 * de venda normal.
 *
 * A Oferta Relâmpago é um preço fixo por produto, cadastrado pelo lojista
 * como "R$X hoje" — igual para qualquer variante escolhida. Por isso, quando
 * `flashOverride` bate, o ajuste de preço da variante NÃO é somado (senão o
 * valor anunciado mudaria dependendo da opção clicada, o que o lojista não
 * configurou nem espera). Fora da oferta relâmpago, o ajuste de variante
 * continua somado normalmente sobre o preço promocional/de venda.
 *
 * `convenioDiscountAmount` (opcional) é o desconto fixo em R$ de um produto
 * na vitrine de convênio do cliente logado (ver
 * `loadConvenioProductDiscounts`). Convênio e Oferta Relâmpago nunca somam —
 * quando os dois se aplicam ao mesmo produto, vale o que der o preço mais
 * baixo. Omitir este argumento reproduz exatamente o comportamento antigo da
 * função (nenhum chamador existente precisa mudar).
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
  convenioDiscountAmount: number | null = null,
  now: Date = new Date()
): number {
  const promoActive = isPromoActive(product.promoPrice, product.promoStartedAt, product.promoEndsAt, now);
  const basePrice = promoActive ? product.promoPrice! : product.salePrice;
  const normalPrice = round2(basePrice + variantPriceAdjustment);

  if (!convenioDiscountAmount) {
    if (flashOverride) return round2(flashOverride.promoPrice);
    return normalPrice;
  }

  const convenioPrice = Math.max(0, round2(normalPrice - convenioDiscountAmount));
  if (!flashOverride) return convenioPrice;
  return Math.min(convenioPrice, round2(flashOverride.promoPrice));
}
