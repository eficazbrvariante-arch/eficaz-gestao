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

const SORT_OPTIONS = [
  { value: "relevancia", label: "Nome (A-Z)" },
  { value: "menor-preco", label: "Menor preço" },
  { value: "maior-preco", label: "Maior preço" },
  { value: "novidades", label: "Novidades" },
] as const;

type SearchParams = {
  q?: string;
  categoria?: string;
  marca?: string;
  ordem?: string;
  pagina?: string;
};

function isSortOption(value: string | undefined): value is ProductFilters["ordem"] {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/** Monta um link preservando os filtros atuais e trocando só o que foi informado. */
function buildQuery(current: SearchParams, changes: Partial<SearchParams>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...changes };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
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

            {categories.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">Categoria</p>
                <ul className="space-y-1 text-sm">
                  <li>
                    <Link
                      href={`${listUrl}${buildQuery(search, { categoria: undefined, pagina: undefined })}`}
                      className={
                        !search.categoria
                          ? "font-medium text-slate-900"
                          : "text-slate-600 hover:text-slate-900"
                      }
                    >
                      Todas
                    </Link>
                  </li>
                  {categories.map((category) => (
                    <li key={category.id}>
                      <Link
                        href={`${listUrl}${buildQuery(search, { categoria: category.id, pagina: undefined })}`}
                        className={
                          search.categoria === category.id
                            ? "font-medium text-slate-900"
                            : "text-slate-600 hover:text-slate-900"
                        }
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brands.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">Marca</p>
                <ul className="space-y-1 text-sm">
                  <li>
                    <Link
                      href={`${listUrl}${buildQuery(search, { marca: undefined, pagina: undefined })}`}
                      className={
                        !search.marca
                          ? "font-medium text-slate-900"
                          : "text-slate-600 hover:text-slate-900"
                      }
                    >
                      Todas
                    </Link>
                  </li>
                  {brands.map((brand) => (
                    <li key={brand.id}>
                      <Link
                        href={`${listUrl}${buildQuery(search, { marca: brand.id, pagina: undefined })}`}
                        className={
                          search.marca === brand.id
                            ? "font-medium text-slate-900"
                            : "text-slate-600 hover:text-slate-900"
                        }
                      >
                        {brand.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
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
                <nav className="mt-8 flex items-center justify-center gap-2 text-sm">
                  {page > 1 && (
                    <Link
                      href={`${listUrl}${buildQuery(search, { pagina: String(page - 1) })}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                    >
                      Anterior
                    </Link>
                  )}
                  <span className="px-2 text-slate-500">
                    Página {page} de {totalPages}
                  </span>
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
