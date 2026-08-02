import Link from "next/link";
import { storeDisplayName, type Store } from "@/modules/catalog/tenant-resolver";
import { CartBadge } from "./cart-badge";
import { StoreSearch } from "./store-search";
import { MobileCategoryMenu } from "./mobile-category-menu";

export function StoreHeader({
  store,
  categories,
}: {
  store: Store;
  categories: { id: string; name: string }[];
}) {
  const base = `/loja/${store.subdomain}`;
  const name = storeDisplayName(store);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <Link href={base} className="flex items-center gap-3">
          {store.logoUrl ? (
            // Imagens vêm de URLs livres cadastradas pela empresa; sem o domínio
            // conhecido de antemão, next/image não pode otimizá-las.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={name} className="h-10 w-auto object-contain" />
          ) : (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: "var(--store-primary)" }}
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="text-lg font-semibold tracking-tight text-slate-900">{name}</span>
        </Link>

        <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
          <StoreSearch base={base} />
        </div>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0">
          <MobileCategoryMenu base={base} categories={categories} />
          <CartBadge href={`${base}/carrinho`} />
        </div>
      </div>

      {categories.length > 0 && (
        <nav className="mx-auto hidden w-full max-w-6xl overflow-x-auto px-4 pb-3 sm:block sm:px-6">
          <ul className="flex gap-2 whitespace-nowrap text-sm">
            <li>
              <Link
                href={`${base}/produtos`}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Todos os produtos
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`${base}/produtos?categoria=${category.id}`}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
