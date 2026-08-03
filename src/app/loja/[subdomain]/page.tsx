import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStoreBySubdomain,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import {
  countCatalogProducts,
  listBestSellers,
  listNewProducts,
  listPromoProducts,
  type CatalogProductCard,
} from "@/modules/catalog/catalog-service";
import { ProductCard, ProductGrid } from "./product-card";
import { FeaturedCarousel } from "./featured-carousel";
import { TrustBar } from "./trust-bar";

/** Arredonda para baixo, num número redondo, para um destaque estável (ex.: "mais de 1.700"). */
function roundedProductCount(total: number) {
  if (total >= 1000) return Math.floor(total / 100) * 100;
  if (total >= 100) return Math.floor(total / 50) * 50;
  if (total >= 10) return Math.floor(total / 10) * 10;
  return total;
}

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

  const SHELF_SIZE = 12;
  const [promos, bestSellers, novelties, totalProducts] = await Promise.all([
    listPromoProducts(store.id, 20),
    listBestSellers(store.id, 20),
    listNewProducts(store.id, SHELF_SIZE),
    countCatalogProducts(store.id),
  ]);

  const isEmpty =
    promos.length === 0 && bestSellers.length === 0 && novelties.length === 0;

  // "Destaques" precisa trazer produtos diferentes dos que já aparecem na
  // prateleira "Promoções" logo abaixo — sem isso, os dois mostravam
  // praticamente a mesma coisa. Prioriza mais vendidos e novidades; só usa o
  // restante das promoções (fora da prateleira) se sobrar espaço.
  const promoShelfIds = new Set(promos.slice(0, SHELF_SIZE).map((p) => p.id));
  const featured = dedupeById([...bestSellers, ...novelties, ...promos])
    .filter((product) => !promoShelfIds.has(product.id))
    .slice(0, 10);

  const city =
    store.addressCity && store.addressState
      ? `${store.addressCity}-${store.addressState}`
      : store.addressCity;
  const displayedCount = roundedProductCount(totalProducts);

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        {(displayedCount >= 10 || city) && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {displayedCount >= 10 && (
              <span>Mais de {displayedCount.toLocaleString("pt-BR")} produtos</span>
            )}
            {displayedCount >= 10 && city && <span aria-hidden>·</span>}
            {city && <span>Loja física em {city}</span>}
          </p>
        )}

        {/* Banner */}
        <section>
          <div
            className="relative min-h-48 overflow-hidden rounded-2xl sm:min-h-0 sm:aspect-[16/5]"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            {store.bannerUrl && (
              // Banner é uma URL cadastrada pela empresa; domínio desconhecido em build time.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.bannerUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {/* Faixa fina no rodapé do banner, na cor da marca, para não cobrir a foto. */}
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col justify-center gap-0.5 px-4 py-2 sm:px-8 sm:py-2.5"
              style={{ backgroundColor: "var(--store-primary)" }}
            >
              <h1 className="truncate text-xs font-semibold leading-tight text-white sm:text-base">
                {store.bannerTitle || `Bem-vindo à ${name}`}
              </h1>
              <p className="truncate text-[11px] leading-tight text-white/90 sm:text-sm">
                {store.bannerSubtitle ||
                  "Confira nossos produtos disponíveis e faça seu pedido pelo WhatsApp."}
              </p>
            </div>
          </div>
          <Link
            href={`${base}/produtos`}
            className="mt-4 inline-block rounded-md px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            Ver todos os produtos
          </Link>
        </section>
      </div>

      <TrustBar city={city} />

      {featured.length > 0 && (
        <FeaturedCarousel>
          {featured.map((product) => (
            <div key={product.id} className="w-[65%] shrink-0 snap-start sm:w-[38%] lg:w-[23%]">
              <ProductCard product={product} base={base} />
            </div>
          ))}
        </FeaturedCarousel>
      )}

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

      {bestSellers.length > 0 && (
        <ShelfSection
          title="Mais vendidos"
          href={`${base}/produtos`}
          products={bestSellers.slice(0, SHELF_SIZE)}
          base={base}
        />
      )}

      {promos.length > 0 && (
        <ShelfSection
          title="Promoções"
          subtitle="Aproveite enquanto durar"
          href={`${base}/produtos?ordem=menor-preco`}
          products={promos.slice(0, SHELF_SIZE)}
          base={base}
        />
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

/** Remove duplicados quando um produto aparece em mais de uma lista (ex.: em promoção e mais vendido). */
function dedupeById(products: CatalogProductCard[]): CatalogProductCard[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
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
