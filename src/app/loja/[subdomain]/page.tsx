import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStoreBySubdomain,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import {
  listBestSellers,
  listNewProducts,
  listPromoProducts,
  type CatalogProductCard,
} from "@/modules/catalog/catalog-service";
import { ProductCard, ProductGrid } from "./product-card";
import { FeaturedCarousel } from "./featured-carousel";

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

  const [promos, bestSellers, novelties] = await Promise.all([
    listPromoProducts(store.id, 10),
    listBestSellers(store.id, 10),
    listNewProducts(store.id),
  ]);

  const isEmpty =
    promos.length === 0 && bestSellers.length === 0 && novelties.length === 0;

  const featured = dedupeById([...promos, ...bestSellers]).slice(0, 10);

  return (
    <div className="space-y-10">
      {/* Banner */}
      <section>
        <div
          className="relative min-h-40 overflow-hidden rounded-2xl sm:min-h-0 sm:aspect-[16/5]"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          {store.bannerUrl && (
            // Banner é uma URL cadastrada pela empresa; domínio desconhecido em build time.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          <div className="relative flex h-full flex-col justify-center px-4 py-4 sm:px-8">
            {/* Fundo sólido só atrás do texto, para não precisar escurecer a foto inteira
                (a imagem do banner pode já trazer seu próprio texto promocional). */}
            <div className="inline-block max-w-xs self-start rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm sm:max-w-xl sm:px-5 sm:py-4">
              <h1 className="text-base font-semibold text-white sm:text-2xl lg:text-3xl">
                {store.bannerTitle || `Bem-vindo à ${name}`}
              </h1>
              <p className="mt-1 text-xs text-white/90 sm:mt-2 sm:text-base">
                {store.bannerSubtitle ||
                  "Confira nossos produtos disponíveis e faça seu pedido pelo WhatsApp."}
              </p>
            </div>
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

      {promos.length > 0 && (
        <ShelfSection
          title="Promoções"
          subtitle="Aproveite enquanto durar"
          href={`${base}/produtos?ordem=menor-preco`}
          products={promos.slice(0, 4)}
          base={base}
        />
      )}

      {bestSellers.length > 0 && (
        <ShelfSection
          title="Mais vendidos"
          href={`${base}/produtos`}
          products={bestSellers.slice(0, 4)}
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
