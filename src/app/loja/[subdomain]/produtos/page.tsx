import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import {
  listCatalogBrands,
  listCatalogCategories,
  listCatalogProducts,
  type ProductFilters,
} from "@/modules/catalog/catalog-service";
import { ProductGrid } from "../product-card";
import { BrandFilter } from "./brand-filter";
import { buildQuery, type SearchParams } from "./query-utils";

const SORT_OPTIONS = [
  { value: "relevancia", label: "Nome (A-Z)" },
  { value: "menor-preco", label: "Menor preço" },
  { value: "maior-preco", label: "Maior preço" },
  { value: "novidades", label: "Novidades" },
] as const;

function isSortOption(value: string | undefined): value is ProductFilters["ordem"] {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/** Números de página a exibir na paginação, com "…" para intervalos omitidos. */
function buildPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  const window = 1;
  const pages: (number | "ellipsis")[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - window && i <= current + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }
  return pages;
}

export default async function StoreProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { subdomain } = await params;
  const search = await searchParams;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const base = `/loja/${store.subdomain}`;
  const listUrl = `${base}/produtos`;

  const [{ products, total, page, totalPages }, categories, brands] = await Promise.all([
    listCatalogProducts(store.id, {
      q: search.q,
      categoria: search.categoria,
      marca: search.marca,
      ordem: isSortOption(search.ordem) ? search.ordem : undefined,
      pagina: search.pagina ? Number(search.pagina) : 1,
    }),
    listCatalogCategories(store.id),
    listCatalogBrands(store.id),
  ]);

  const activeCategory = categories.find((c) => c.id === search.categoria);
  const activeBrand = brands.find((b) => b.id === search.marca);
  const hasFilters = Boolean(search.q || search.categoria || search.marca);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {search.q ? `Resultados para "${search.q}"` : activeCategory?.name ?? "Todos os produtos"}
        </h1>
        <p className="text-sm text-slate-500">
          {total} produto{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Filtros */}
        <aside className="lg:col-span-1">
          <div className="space-y-6 rounded-xl border border-slate-200 p-4">
            {hasFilters && (
              <Link href={listUrl} className="block text-sm text-slate-600 hover:underline">
                Limpar filtros
              </Link>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Ordenar por</p>
              <ul className="space-y-1 text-sm">
                {SORT_OPTIONS.map((option) => {
                  const isActive =
                    (search.ordem ?? "relevancia") === option.value;
                  return (
                    <li key={option.value}>
                      <Link
                        href={`${listUrl}${buildQuery(search, { ordem: option.value, pagina: undefined })}`}
                        className={
                          isActive
                            ? "font-medium text-slate-900"
                            : "text-slate-600 hover:text-slate-900"
                        }
                      >
                        {option.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {brands.length > 0 && (
              <BrandFilter brands={brands} listUrl={listUrl} search={search} />
            )}
          </div>
        </aside>

        {/* Resultados */}
        <div className="lg:col-span-3">
          {(activeCategory || activeBrand) && (
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              {activeCategory && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  Categoria: {activeCategory.name}
                </span>
              )}
              {activeBrand && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  Marca: {activeBrand.name}
                </span>
              )}
            </div>
          )}

          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
              <p className="text-slate-600">Nenhum produto encontrado.</p>
              {hasFilters && (
                <Link
                  href={listUrl}
                  className="mt-2 inline-block text-sm text-slate-500 hover:underline"
                >
                  Limpar filtros e ver tudo
                </Link>
              )}
            </div>
          ) : (
            <>
              <ProductGrid products={products} base={base} />

              {totalPages > 1 && (
                <nav
                  className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm"
                  aria-label="Paginação"
                >
                  {page > 1 && (
                    <Link
                      href={`${listUrl}${buildQuery(search, { pagina: String(page - 1) })}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                    >
                      Anterior
                    </Link>
                  )}

                  {buildPageNumbers(page, totalPages).map((item, index) =>
                    item === "ellipsis" ? (
                      <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
                        …
                      </span>
                    ) : (
                      <Link
                        key={item}
                        href={`${listUrl}${buildQuery(search, { pagina: String(item) })}`}
                        aria-current={item === page ? "page" : undefined}
                        className={
                          item === page
                            ? "rounded-md px-3 py-1.5 font-semibold text-white"
                            : "rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                        }
                        style={item === page ? { backgroundColor: "var(--store-primary)" } : undefined}
                      >
                        {item}
                      </Link>
                    )
                  )}

                  {page < totalPages && (
                    <Link
                      href={`${listUrl}${buildQuery(search, { pagina: String(page + 1) })}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                    >
                      Próxima
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
