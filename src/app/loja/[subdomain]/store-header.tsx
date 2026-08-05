import Link from "next/link";
import Image from "next/image";
import { storeDisplayName, type Store } from "@/modules/catalog/tenant-resolver";
import { CartBadge } from "./cart-badge";
import { StoreSearch } from "./store-search";
import { CategoryMenu } from "./category-menu";

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
        <Link href={base} className="order-1 flex items-center gap-3">
          {store.logoUrl ? (
            <Image
              src={store.logoUrl}
              alt={name}
              width={80}
              height={40}
              priority
              className="h-10 w-auto object-contain"
            />
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

        <div className="order-3 sm:order-2">
          <CategoryMenu base={base} categories={categories} />
        </div>

        <div className="order-4 w-full sm:order-3 sm:w-auto sm:flex-1">
          <StoreSearch base={base} />
        </div>

        <div className="order-2 ml-auto sm:order-4 sm:ml-0">
          <CartBadge href={`${base}/carrinho`} />
        </div>
      </div>
    </header>
  );
}
