import { prisma } from "@/lib/prisma";
import { getLowestPriceLast30Days } from "@/modules/products/price-history";

const LAUNCH_WINDOW_DAYS = 15;

/**
 * Um produto só aparece na loja se estiver ativo, marcado para o catálogo, e
 * fora de uma categoria exclusiva de balcão (`Category.counterOnly`). Esta
 * condição é a base de toda consulta pública — nunca consulte produtos do
 * catálogo sem ela. Cobre listagem, busca, categoria e link direto do
 * produto, porque `getCatalogProduct` também usa esta mesma função.
 */
function publicProductWhere(tenantId: string) {
  return {
    tenantId,
    active: true,
    showInCatalog: true,
    OR: [{ categoryId: null }, { category: { counterOnly: false } }],
  };
}

const productCardSelect = {
  id: true,
  name: true,
  salePrice: true,
  promoPrice: true,
  promoEndsAt: true,
  stockQty: true,
  avgRating: true,
  reviewCount: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
} as const;

export type CatalogProductCard = {
  id: string;
  name: string;
  price: number;
  promoPrice: number | null;
  promoEndsAt: Date | null;
  stockQty: number;
  categoryName: string | null;
  brandName: string | null;
  imageUrl: string | null;
  avgRating: number | null;
  reviewCount: number;
  /** Quantidade real já vendida (PDV + pedidos online concluídos). `null` até a consulta em lote preencher. */
  soldQty: number;
  /** Menor preço efetivo dos últimos 30 dias — só presente quando maior que o preço atual (Lei do Preço Riscado). */
  strikePrice: number | null;
  discountPercent: number | null;
  isFlashDeal: boolean;
};

type RawProductCard = {
  id: string;
  name: string;
  salePrice: unknown;
  promoPrice: unknown;
  promoEndsAt: Date | null;
  stockQty: number;
  avgRating: unknown;
  reviewCount: number;
  createdAt: Date;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  images: { url: string }[];
};

function toCard(product: RawProductCard): CatalogProductCard {
  const price = Number(product.salePrice);
  const promoPrice = product.promoPrice === null ? null : Number(product.promoPrice);
  const isFlashDeal = Boolean(
    promoPrice !== null && product.promoEndsAt && product.promoEndsAt.getTime() > Date.now()
  );

  return {
    id: product.id,
    name: product.name,
    price,
    promoPrice,
    promoEndsAt: product.promoEndsAt,
    stockQty: product.stockQty,
    categoryName: product.category?.name ?? null,
    brandName: product.brand?.name ?? null,
    imageUrl: product.images[0]?.url ?? null,
    avgRating: product.avgRating === null ? null : Number(product.avgRating),
    reviewCount: product.reviewCount,
    soldQty: 0,
    strikePrice: null,
    discountPercent: null,
    isFlashDeal,
  };
}

/** Preço final exibido: promocional quando existir. */
export function effectivePrice(product: Pick<CatalogProductCard, "price" | "promoPrice">) {
  return product.promoPrice ?? product.price;
}

/** Soma de itens vendidos (PDV + pedidos online concluídos), em lote por produto. */
async function sumSoldQuantities(
  tenantId: string,
  productIds?: string[]
): Promise<Map<string, number>> {
  if (productIds && productIds.length === 0) return new Map();

  const idFilter = productIds ? { productId: { in: productIds } } : {};
  const [saleRows, orderRows] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { ...idFilter, sale: { tenantId, status: "COMPLETED" } },
      _sum: { quantity: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { ...idFilter, order: { tenantId, status: "COMPLETED" } },
      _sum: { quantity: true },
    }),
  ]);

  const totals = new Map<string, number>();
  for (const row of saleRows) {
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  for (const row of orderRows) {
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  return totals;
}

/**
 * Preenche, em lote, os campos que dependem de outras tabelas (preço riscado
 * real dos últimos 30 dias e quantidade vendida real) — chamada ao final de
 * toda função de listagem, para nunca gerar N+1 por card.
 */
async function enrichCards(
  tenantId: string,
  cards: CatalogProductCard[]
): Promise<CatalogProductCard[]> {
  if (cards.length === 0) return cards;

  const ids = cards.map((c) => c.id);
  const [lowestPrices, soldQuantities] = await Promise.all([
    getLowestPriceLast30Days(tenantId, ids),
    sumSoldQuantities(tenantId, ids),
  ]);

  return cards.map((card) => {
    const current = effectivePrice(card);
    const lowest = lowestPrices.get(card.id);
    const hasGenuineStrike = lowest !== undefined && lowest > current;

    return {
      ...card,
      soldQty: soldQuantities.get(card.id) ?? 0,
      strikePrice: hasGenuineStrike ? lowest! : null,
      discountPercent: hasGenuineStrike ? Math.round(((lowest! - current) / lowest!) * 100) : null,
    };
  });
}

export type ProductFilters = {
  q?: string;
  categoria?: string;
  marca?: string;
  ordem?: "relevancia" | "menor-preco" | "maior-preco" | "novidades";
  pagina?: number;
};

const PAGE_SIZE = 12;

export async function listCatalogProducts(tenantId: string, filters: ProductFilters) {
  const page = Math.max(1, filters.pagina ?? 1);

  const where = {
    ...publicProductWhere(tenantId),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { description: { contains: filters.q, mode: "insensitive" as const } },
            { barcode: filters.q },
          ],
        }
      : {}),
    ...(filters.categoria ? { categoryId: filters.categoria } : {}),
    ...(filters.marca ? { brandId: filters.marca } : {}),
  };

  // Ordena pelo preço que o cliente paga (coluna derivada `catalogPrice`),
  // para as promoções entrarem na ordenação corretamente.
  const orderBy = (() => {
    switch (filters.ordem) {
      case "menor-preco":
        return { catalogPrice: "asc" as const };
      case "maior-preco":
        return { catalogPrice: "desc" as const };
      case "novidades":
        return { createdAt: "desc" as const };
      default:
        return { name: "asc" as const };
    }
  })();

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productCardSelect,
      // Destaque manual sempre primeiro; dentro dele, produtos sem foto vão pro
      // fim (não somem, só perdem prioridade) até ganharem uma imagem — a
      // ordenação escolhida pelo cliente decide a posição dentro de cada grupo.
      orderBy: [{ isFeatured: "desc" }, { images: { _count: "desc" } }, orderBy],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: await enrichCards(tenantId, products.map(toCard)),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Produtos em promoção (com preço promocional definido).
 *
 * Exige ao menos uma imagem: as vitrines da home são a vitrine principal da
 * loja, e um produto sem foto ali prejudica a apresentação.
 */
export async function listPromoProducts(tenantId: string, take = 4) {
  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere(tenantId),
      promoPrice: { not: null },
      images: { some: {} },
    },
    select: productCardSelect,
    orderBy: { updatedAt: "desc" },
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/**
 * Ofertas relâmpago: promoção com prazo definido (`promoEndsAt`) ainda no
 * futuro. Diferente de `listPromoProducts`, que cobre promoções sem prazo.
 */
export async function listFlashDeals(tenantId: string, take = 8) {
  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere(tenantId),
      promoPrice: { not: null },
      promoEndsAt: { gt: new Date() },
      images: { some: {} },
    },
    select: productCardSelect,
    orderBy: { promoEndsAt: "asc" },
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/** Últimos produtos cadastrados (exige foto — ver nota em `listPromoProducts`). */
export async function listNewProducts(tenantId: string, take = 4) {
  const products = await prisma.product.findMany({
    where: { ...publicProductWhere(tenantId), images: { some: {} } },
    select: productCardSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/**
 * Lançamentos: recorte mais estreito que "Novidades" (últimos ~15 dias), para
 * destacar o que chegou de fato recentemente. O chamador (home) é responsável
 * por não repetir produtos que já apareceram na prateleira de novidades.
 */
export async function listLaunches(tenantId: string, take = 8) {
  const since = new Date(Date.now() - LAUNCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere(tenantId),
      images: { some: {} },
      createdAt: { gte: since },
    },
    select: productCardSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/**
 * Destaques escolhidos manualmente (`Product.isFeatured`) — curadoria do
 * lojista, sem relação com vendas reais. Fica separado de `listBestSellers`
 * de propósito: misturar os dois faria "Mais vendidos" deixar de ser um
 * sinal confiável pro cliente.
 */
export async function listFeaturedProducts(tenantId: string, take = 10) {
  const products = await prisma.product.findMany({
    where: { ...publicProductWhere(tenantId), isFeatured: true, images: { some: {} } },
    select: productCardSelect,
    orderBy: { updatedAt: "desc" },
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/**
 * Mais vendidos do catálogo, apurados a partir de vendas no PDV e de pedidos
 * concluídos do catálogo online — as duas origens reais de venda da loja.
 * Produtos que saíram do catálogo ou não têm foto são descartados do ranking
 * (ver nota em `listPromoProducts`).
 */
export async function listBestSellers(tenantId: string, take = 4) {
  const totals = await sumSoldQuantities(tenantId);
  if (totals.size === 0) return [];

  const ranking = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const candidateIds = ranking.slice(0, take * 3).map(([productId]) => productId);

  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere(tenantId),
      id: { in: candidateIds },
      images: { some: {} },
    },
    select: productCardSelect,
  });

  const order = new Map(ranking.map(([productId], index) => [productId, index]));
  const cards = products
    .map(toCard)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, take);

  return enrichCards(tenantId, cards);
}

/**
 * Sugestões baseadas nas categorias dos produtos que o próprio visitante viu
 * na sessão (ver `recently-viewed` no client). Sem histórico de navegação
 * real, retorna lista vazia — nunca uma lista genérica com essa etiqueta.
 */
export async function listRecommendedFor(
  tenantId: string,
  recentlyViewedProductIds: string[],
  take = 8
) {
  if (recentlyViewedProductIds.length === 0) return [];

  const viewed = await prisma.product.findMany({
    where: { id: { in: recentlyViewedProductIds }, tenantId },
    select: { categoryId: true },
  });
  const categoryIds = Array.from(
    new Set(viewed.map((p) => p.categoryId).filter((id): id is string => Boolean(id)))
  );
  if (categoryIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere(tenantId),
      categoryId: { in: categoryIds },
      id: { notIn: recentlyViewedProductIds },
      images: { some: {} },
    },
    select: productCardSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/**
 * "Quem comprou este item também comprou": outros produtos que apareceram
 * nas mesmas vendas/pedidos concluídos que já incluíram `productId`. Fica na
 * página do produto (não na home) porque exige um produto de referência real.
 */
export async function listFrequentlyBoughtWith(tenantId: string, productId: string, take = 4) {
  const COOCCURRENCE_LOOKBACK = 200;

  const [saleRefs, orderRefs] = await Promise.all([
    prisma.saleItem.findMany({
      where: { productId, sale: { tenantId, status: "COMPLETED" } },
      select: { saleId: true },
      orderBy: { id: "desc" },
      take: COOCCURRENCE_LOOKBACK,
    }),
    prisma.orderItem.findMany({
      where: { productId, order: { tenantId, status: "COMPLETED" } },
      select: { orderId: true },
      orderBy: { id: "desc" },
      take: COOCCURRENCE_LOOKBACK,
    }),
  ]);

  const saleIds = saleRefs.map((s) => s.saleId);
  const orderIds = orderRefs.map((o) => o.orderId);
  if (saleIds.length === 0 && orderIds.length === 0) return [];

  const [coSaleItems, coOrderItems] = await Promise.all([
    saleIds.length > 0
      ? prisma.saleItem.groupBy({
          by: ["productId"],
          where: { saleId: { in: saleIds }, productId: { not: productId } },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    orderIds.length > 0
      ? prisma.orderItem.groupBy({
          by: ["productId"],
          where: { orderId: { in: orderIds }, productId: { not: productId } },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
  ]);

  const scores = new Map<string, number>();
  for (const row of coSaleItems) {
    scores.set(row.productId, (scores.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  for (const row of coOrderItems) {
    scores.set(row.productId, (scores.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  if (scores.size === 0) return [];

  const ranking = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const candidateIds = ranking.slice(0, take * 2).map(([id]) => id);

  const products = await prisma.product.findMany({
    where: { ...publicProductWhere(tenantId), id: { in: candidateIds }, images: { some: {} } },
    select: productCardSelect,
  });

  const order = new Map(ranking.map(([id], index) => [id, index]));
  const cards = products
    .map(toCard)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, take);

  return enrichCards(tenantId, cards);
}

export async function getCatalogProduct(tenantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { ...publicProductWhere(tenantId), id: productId },
    select: {
      id: true,
      name: true,
      description: true,
      salePrice: true,
      promoPrice: true,
      promoEndsAt: true,
      stockQty: true,
      avgRating: true,
      reviewCount: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: { select: { id: true, url: true }, orderBy: { order: "asc" } },
      variants: {
        select: { id: true, name: true, priceAdjustment: true, stockQty: true },
      },
      reviews: {
        select: { id: true, authorName: true, rating: true, comment: true, source: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!product) return null;

  const price = Number(product.salePrice);
  const promoPrice = product.promoPrice === null ? null : Number(product.promoPrice);
  const current = promoPrice ?? price;

  const [lowestPrices, soldQuantities] = await Promise.all([
    getLowestPriceLast30Days(tenantId, [product.id]),
    sumSoldQuantities(tenantId, [product.id]),
  ]);
  const lowest = lowestPrices.get(product.id);
  const hasGenuineStrike = lowest !== undefined && lowest > current;

  return {
    ...product,
    avgRating: product.avgRating === null ? null : Number(product.avgRating),
    isFlashDeal: Boolean(
      promoPrice !== null && product.promoEndsAt && product.promoEndsAt.getTime() > Date.now()
    ),
    soldQty: soldQuantities.get(product.id) ?? 0,
    strikePrice: hasGenuineStrike ? lowest! : null,
    discountPercent: hasGenuineStrike ? Math.round(((lowest! - current) / lowest!) * 100) : null,
  };
}

/** Outros produtos da mesma categoria. */
export async function listRelatedProducts(
  tenantId: string,
  productId: string,
  categoryId: string | null,
  take = 4
) {
  if (!categoryId) return [];
  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere(tenantId),
      categoryId,
      id: { not: productId },
    },
    select: productCardSelect,
    take,
  });
  return enrichCards(tenantId, products.map(toCard));
}

/** Quantidade de produtos visíveis no catálogo (para destaques como "mais de N produtos"). */
export async function countCatalogProducts(tenantId: string) {
  return prisma.product.count({ where: publicProductWhere(tenantId) });
}

/** Marcas que possuem ao menos um produto visível na loja. */
export async function listCatalogBrands(tenantId: string) {
  return prisma.brand.findMany({
    where: { tenantId, products: { some: publicProductWhere(tenantId) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Categorias que possuem ao menos um produto visível na loja. */
export async function listCatalogCategories(tenantId: string) {
  return prisma.category.findMany({
    where: {
      tenantId,
      counterOnly: false,
      products: { some: { active: true, showInCatalog: true } },
    },
    select: { id: true, name: true, icon: true, _count: { select: { products: true } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
}

/** Nota média geral da loja e nº de avaliações, para o indicador de confiança do topo. Some se não houver nenhuma. */
export async function getStoreRatingSummary(tenantId: string) {
  const result = await prisma.product.aggregate({
    where: { ...publicProductWhere(tenantId), reviewCount: { gt: 0 } },
    _avg: { avgRating: true },
    _sum: { reviewCount: true },
  });
  if (!result._sum.reviewCount) return null;
  return {
    avgRating: Number(result._avg.avgRating ?? 0),
    reviewCount: result._sum.reviewCount,
  };
}
