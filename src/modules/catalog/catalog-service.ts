import { prisma } from "@/lib/prisma";

/**
 * Um produto só aparece na loja se estiver ativo e marcado para o catálogo.
 * Esta condição é a base de toda consulta pública — nunca consulte produtos
 * do catálogo sem ela.
 */
function publicProductWhere(tenantId: string) {
  return { tenantId, active: true, showInCatalog: true } as const;
}

const productCardSelect = {
  id: true,
  name: true,
  salePrice: true,
  promoPrice: true,
  stockQty: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
} as const;

export type CatalogProductCard = {
  id: string;
  name: string;
  price: number;
  promoPrice: number | null;
  stockQty: number;
  categoryName: string | null;
  brandName: string | null;
  imageUrl: string | null;
};

type RawProductCard = {
  id: string;
  name: string;
  salePrice: unknown;
  promoPrice: unknown;
  stockQty: number;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  images: { url: string }[];
};

function toCard(product: RawProductCard): CatalogProductCard {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.salePrice),
    promoPrice: product.promoPrice === null ? null : Number(product.promoPrice),
    stockQty: product.stockQty,
    categoryName: product.category?.name ?? null,
    brandName: product.brand?.name ?? null,
    imageUrl: product.images[0]?.url ?? null,
  };
}

/** Preço final exibido: promocional quando existir. */
export function effectivePrice(product: Pick<CatalogProductCard, "price" | "promoPrice">) {
  return product.promoPrice ?? product.price;
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
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map(toCard),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Produtos em promoção (com preço promocional definido). */
export async function listPromoProducts(tenantId: string, take = 4) {
  const products = await prisma.product.findMany({
    where: { ...publicProductWhere(tenantId), promoPrice: { not: null } },
    select: productCardSelect,
    orderBy: { updatedAt: "desc" },
    take,
  });
  return products.map(toCard);
}

/** Últimos produtos cadastrados. */
export async function listNewProducts(tenantId: string, take = 4) {
  const products = await prisma.product.findMany({
    where: publicProductWhere(tenantId),
    select: productCardSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
  return products.map(toCard);
}

/**
 * Mais vendidos do catálogo, apurados a partir dos itens de vendas concluídas.
 * Produtos que saíram do catálogo são descartados do ranking.
 */
export async function listBestSellers(tenantId: string, take = 4) {
  const ranking = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { sale: { tenantId, status: "COMPLETED" } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: take * 3,
  });
  if (ranking.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { ...publicProductWhere(tenantId), id: { in: ranking.map((r) => r.productId) } },
    select: productCardSelect,
  });

  const order = new Map(ranking.map((r, index) => [r.productId, index]));
  return products
    .map(toCard)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, take);
}

export async function getCatalogProduct(tenantId: string, productId: string) {
  return prisma.product.findFirst({
    where: { ...publicProductWhere(tenantId), id: productId },
    select: {
      id: true,
      name: true,
      description: true,
      salePrice: true,
      promoPrice: true,
      stockQty: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: { select: { id: true, url: true }, orderBy: { order: "asc" } },
      variants: {
        select: { id: true, name: true, priceAdjustment: true, stockQty: true },
      },
    },
  });
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
  return products.map(toCard);
}

/** Marcas que possuem ao menos um produto visível na loja. */
export async function listCatalogBrands(tenantId: string) {
  return prisma.brand.findMany({
    where: { tenantId, products: { some: { active: true, showInCatalog: true } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Categorias que possuem ao menos um produto visível na loja. */
export async function listCatalogCategories(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId, products: { some: { active: true, showInCatalog: true } } },
    select: { id: true, name: true, _count: { select: { products: true } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
}
