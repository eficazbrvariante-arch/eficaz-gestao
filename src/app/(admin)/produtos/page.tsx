import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageEmployeeLedger } from "@/lib/permissions";
import { ProdutosTabs } from "./produtos-tabs";
import { ProdutosHeader } from "./produtos-header";
import { ProdutosResumoCards } from "./produtos-resumo-cards";
import { ProdutosFiltros } from "./produtos-filtros";
import { ProdutosTabela } from "./produtos-tabela";
import { Pagination } from "@/components/ui/pagination";
import {
  getProductList,
  getProductSummary,
  type ProductSort,
  type SortDir,
  type StatusFilter,
  type StockFilter,
} from "@/modules/products/product-list-query";

const SORT_VALUES: ProductSort[] = ["name", "price", "stock", "updatedAt"];
const STATUS_VALUES: StatusFilter[] = ["all", "active", "inactive"];
const STOCK_VALUES: StockFilter[] = ["all", "instock", "low", "out"];
const PAGE_SIZE_VALUES = [20, 50, 100];

function pick<T extends string>(value: string | undefined, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    brand?: string;
    status?: string;
    stock?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const q = params.q?.trim() || undefined;
  const categoryId = params.category || undefined;
  const brandId = params.brand || undefined;
  const status = pick(params.status, STATUS_VALUES, "all");
  const stock = pick(params.stock, STOCK_VALUES, "all");
  const sort = pick(params.sort, SORT_VALUES, "name");
  const dir = pick(params.dir, ["asc", "desc"] as SortDir[], "asc");
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = PAGE_SIZE_VALUES.includes(Number(params.pageSize))
    ? Number(params.pageSize)
    : 20;

  const [categories, brands, tenant, summary, { items, total }] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { subdomain: true } }),
    getProductSummary(user.tenantId),
    getProductList({
      tenantId: user.tenantId,
      q,
      categoryId,
      brandId,
      status,
      stock,
      sort,
      dir,
      page,
      pageSize,
    }),
  ]);

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-page p-6">
      <ProdutosHeader />
      <ProdutosTabs />
      <ProdutosResumoCards summary={summary} status={status} stock={stock} />
      <ProdutosFiltros categories={categories} brands={brands} />
      <ProdutosTabela
        items={items}
        sort={sort}
        dir={dir}
        storeSubdomain={tenant.subdomain}
        categories={categories}
        brands={brands}
        canManageCommission={canManageEmployeeLedger(user.role)}
      />
      {total > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <Pagination page={page} pageSize={pageSize} total={total} />
        </div>
      )}
    </div>
  );
}
