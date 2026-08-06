import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export type ProductSort = "name" | "price" | "stock" | "updatedAt";
export type SortDir = "asc" | "desc";
export type StatusFilter = "all" | "active" | "inactive";
export type StockFilter = "all" | "instock" | "low" | "out";

export type ProductListParams = {
  tenantId: string;
  q?: string;
  categoryId?: string;
  brandId?: string;
  status: StatusFilter;
  stock: StockFilter;
  sort: ProductSort;
  dir: SortDir;
  page: number;
  pageSize: number;
};

const SORT_FIELD: Record<ProductSort, keyof Prisma.ProductOrderByWithRelationInput> = {
  name: "name",
  price: "catalogPrice",
  stock: "stockQty",
  updatedAt: "updatedAt",
};

type RawProductListItem = Prisma.ProductGetPayload<{
  include: {
    category: true;
    brand: true;
    images: true;
    _count: { select: { saleItems: true } };
  };
}>;

/**
 * Mesmo formato do Prisma, mas com os campos `Decimal` convertidos pra
 * `number` — `Decimal` não é um objeto plano e o React rejeita passá-lo de
 * Server pra Client Component (é exatamente por isso que a listagem passa
 * por aqui em vez de devolver o resultado do Prisma direto).
 */
export type ProductListItem = Omit<
  RawProductListItem,
  "costPrice" | "salePrice" | "promoPrice" | "catalogPrice" | "avgRating"
> & {
  costPrice: number;
  salePrice: number;
  promoPrice: number | null;
  catalogPrice: number;
  avgRating: number | null;
};

function toProductListItem(product: RawProductListItem): ProductListItem {
  return {
    ...product,
    costPrice: Number(product.costPrice),
    salePrice: Number(product.salePrice),
    promoPrice: product.promoPrice !== null ? Number(product.promoPrice) : null,
    catalogPrice: Number(product.catalogPrice),
    avgRating: product.avgRating !== null ? Number(product.avgRating) : null,
  };
}

export type ProductSummary = {
  total: number;
  active: number;
  lowStock: number;
  outOfStock: number;
};

/**
 * "Estoque baixo" compara duas colunas da mesma linha (stockQty <= minStock),
 * o que o `where` tipado do Prisma não expressa — daqui pra baixo, as únicas
 * duas queries raw deste módulo. Espelham exatamente a regra de
 * `isLowStock`/`isOutOfStock` em `stock-status.ts` (fonte única da regra;
 * só reescrita em SQL porque aqui ela precisa rodar dentro do banco).
 */
export async function getProductSummary(tenantId: string): Promise<ProductSummary> {
  const rows = await prisma.$queryRaw<
    { total: bigint; active: bigint; lowStock: bigint; outOfStock: bigint }[]
  >`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE active) AS active,
      count(*) FILTER (WHERE "minStock" > 0 AND "stockQty" > 0 AND "stockQty" <= "minStock") AS "lowStock",
      count(*) FILTER (WHERE "stockQty" <= 0) AS "outOfStock"
    FROM products
    WHERE "tenantId" = ${tenantId}
  `;
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    lowStock: Number(row?.lowStock ?? 0),
    outOfStock: Number(row?.outOfStock ?? 0),
  };
}

async function lowStockProductIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM products
    WHERE "tenantId" = ${tenantId}
      AND "minStock" > 0 AND "stockQty" > 0 AND "stockQty" <= "minStock"
  `;
  return rows.map((row) => row.id);
}

export async function getProductList(
  params: ProductListParams
): Promise<{ items: ProductListItem[]; total: number }> {
  const { tenantId, q, categoryId, brandId, status, stock, sort, dir, page, pageSize } = params;

  const where: Prisma.ProductWhereInput = { tenantId };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { internalCode: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      { brand: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (brandId) where.brandId = brandId;
  if (status === "active") where.active = true;
  if (status === "inactive") where.active = false;

  if (stock === "out") {
    where.stockQty = { lte: 0 };
  } else if (stock === "low") {
    const lowIds = await lowStockProductIds(tenantId);
    if (lowIds.length === 0) return { items: [], total: 0 };
    where.id = { in: lowIds };
  } else if (stock === "instock") {
    const lowIds = await lowStockProductIds(tenantId);
    where.stockQty = { gt: 0 };
    if (lowIds.length > 0) where.id = { notIn: lowIds };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = { [SORT_FIELD[sort]]: dir };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        brand: true,
        images: { take: 1, orderBy: { order: "asc" } },
        _count: { select: { saleItems: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: items.map(toProductListItem), total };
}
