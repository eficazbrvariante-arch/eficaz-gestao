import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStoreBySubdomain,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import {
  listBestSellers,
  listCatalogCategories,
  listNewProducts,
  listPromoProducts,
} from "@/modules/catalog/catalog-service";
import { ProductGrid } from "./product-card";

export default async function StoreHomePage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const base = `/loja/${store.subdomain}`;
  const name = storeDisplayName(store);

  const [promos, bestSellers, novelties, categories] = await Promise.all([
    listPromoProducts(store.id),
    listBestSellers(store.id),
    listNewProducts(store.id),
    listCatalogCategories(store.id),
  ]);

  const isEmpty =
    promos.length === 0 && bestSellers.length === 0 && novelties.length === 0;

  return (
    <div className="space-y-10">
      {/* Banner */}
      <section
        className="relative overflow-hidden rounded-2xl"
        style={{ backgroundColor: "var(--store-primary)" }}
      >
        {store.bannerUrl && (
          // Banner é uma URL cadastrada pela empresa; domínio desconhecido em build time.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        )}
        <div className="relative px-6 py-12 sm:px-10 sm:py-16">
          <h1 className="max-w-2xl text-2xl font-semibold text-white sm:text-3xl">
            {store.bannerTitle || `Bem-vindo à ${name}`}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">
            {store.bannerSubtitle ||
              "Confira nossos produtos disponíveis e faça seu pedido pelo WhatsApp."}
          </p>
          <Link
            href={`${base}/produtos`}
            className="mt-6 inline-block rounded-md bg-white px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Ver todos os produtos
          </Link>
        </div>
      </section>

      {isEmpty && (
        <section className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-600">
            Ainda não há produtos publicados no catálogo desta loja.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Os produtos aparecem aqui quando marcados como &quot;Mostrar no catálogo online&quot;.
          </p>
        </section>
      )}

      {categories.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Categorias</h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`${base}/produtos?categoria=${category.id}`}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {promos.length > 0 && (
        <ShelfSection
          title="Promoções"
          subtitle="Aproveite enquanto durar"
          href={`${base}/produtos?ordem=menor-preco`}
          products={promos}
          base={base}
        />
      )}

      {bestSellers.length > 0 && (
        <ShelfSection title="Mais vendidos" href={`${base}/produtos`} products={bestSellers} base={base} />
      )}

      {novelties.length > 0 && (
        <ShelfSection
          title="Novidades"
          href={`${base}/produtos?ordem=novidades`}
          products={novelties}
          base={base}
        />
      )}
    </div>
  );
}

function ShelfSection({
  title,
  subtitle,
  href,
  products,
  base,
}: {
  title: string;
  subtitle?: string;
  href: string;
  products: Awaited<ReturnType<typeof listPromoProducts>>;
  base: string;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Link href={href} className="shrink-0 text-sm text-slate-600 hover:underline">
          Ver mais
        </Link>
      </div>
      <ProductGrid products={products} base={base} />
    </section>
  );
}
