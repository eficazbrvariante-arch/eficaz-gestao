import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  getStoreBySubdomain,
  storeCityLabel,
  storeCommerceInfo,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import {
  countCatalogProducts,
  getStoreRatingSummary,
  groupCategoriesByParent,
  hasRelevantSalesVolume,
  listBestSellers,
  listCatalogCategories,
  listFeaturedProducts,
  listFlashDeals,
  listLaunches,
  listNewProducts,
  listPromoProducts,
  listRecommendedFor,
  MIN_RELEVANT_SOLD_QTY,
  type CatalogProductCard,
} from "@/modules/catalog/catalog-service";
import { recentlyViewedCookieName, parseRecentlyViewed } from "@/lib/recently-viewed";
import { ProductCard, ProductGrid } from "./product-card";
import { FeaturedCarousel } from "./featured-carousel";
import { ExpressDeliveryBanner } from "./express-delivery-banner";
import { MacroCategoryRow } from "./macro-category-row";

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

  const cookieStore = await cookies();
  const recentlyViewedIds = parseRecentlyViewed(
    cookieStore.get(recentlyViewedCookieName(store.subdomain))?.value
  );

  const SHELF_SIZE = 12;
  // "Evitar poluição visual": a Oferta Relâmpago é uma vitrine de urgência,
  // não mais uma prateleira comum — poucos itens de propósito.
  const FLASH_DEAL_SHELF_SIZE = 3;
  const [
    featuredManual,
    promos,
    bestSellers,
    novelties,
    flashDeals,
    launches,
    recommended,
    totalProducts,
    ratingSummary,
    categories,
  ] = await Promise.all([
    // Limite alto de propósito: destaque manual nunca deveria ser "cortado"
    // silenciosamente por causa de outros produtos marcados depois.
    listFeaturedProducts(store.id, 40),
    listPromoProducts(store.id, 20),
    listBestSellers(store.id, 20),
    listNewProducts(store.id, SHELF_SIZE),
    listFlashDeals(store.id, FLASH_DEAL_SHELF_SIZE),
    listLaunches(store.id, SHELF_SIZE),
    listRecommendedFor(store.id, recentlyViewedIds, SHELF_SIZE),
    countCatalogProducts(store.id),
    getStoreRatingSummary(store.id),
    listCatalogCategories(store.id),
  ]);
  const categoryGroups = groupCategoriesByParent(categories);

  const isEmpty =
    featuredManual.length === 0 &&
    promos.length === 0 &&
    bestSellers.length === 0 &&
    novelties.length === 0;

  // "Destaques" precisa trazer produtos diferentes dos que já aparecem na
  // prateleira "Promoções" logo abaixo — sem isso, os dois mostravam
  // praticamente a mesma coisa. Destaque manual (curadoria do lojista) vem
  // sempre primeiro; o resto do espaço é preenchido organicamente por mais
  // vendidos e novidades, e só usa o restante das promoções se sobrar espaço.
  const promoShelfIds = new Set(promos.slice(0, SHELF_SIZE).map((p) => p.id));
  const featuredManualIds = new Set(featuredManual.map((p) => p.id));
  // O destaque manual nunca é cortado (o lojista escolheu, mostra tudo); o
  // orgânico só entra pra completar até 10, se sobrar espaço.
  const featured = [
    ...featuredManual,
    ...dedupeById([...bestSellers, ...novelties, ...promos]).filter(
      (product) => !promoShelfIds.has(product.id) && !featuredManualIds.has(product.id)
    ),
  ].slice(0, Math.max(8, featuredManual.length));

  const bestSellerShelf = bestSellers.slice(0, SHELF_SIZE);
  const bestSellerIds = new Set(bestSellerShelf.map((p) => p.id));
  // Só entra como "Mais vendido" quem de fato vendeu uma quantidade relevante
  // — sem isso, o badge (e o rótulo "Mais vendidos" da prateleira, ver abaixo)
  // apareceriam mesmo quando só 1 unidade foi vendida, o que enfraquece a
  // prova social em vez de reforçar. Continua um subconjunto de
  // `bestSellerIds` — o dedupe entre prateleiras (`shown`, logo abaixo)
  // precisa da lista completa, não só de quem ganha o selo.
  const bestSellerBadgeIds = new Set(
    bestSellerShelf.filter((p) => p.soldQty >= MIN_RELEVANT_SOLD_QTY).map((p) => p.id)
  );
  const bestSellerShelfTitle = hasRelevantSalesVolume(bestSellerShelf)
    ? "Mais vendidos"
    : "Mais procurados";

  // Cada prateleira nomeada abaixo só mostra produtos que ainda não
  // apareceram numa prateleira nomeada anterior — sem isso, catálogos
  // pequenos (poucos produtos em promoção/lançamento) repetem os mesmos
  // cards em quase toda seção da home. O carrossel "Destaques" fica de fora
  // dessa cadeia (é normal repetir com as prateleiras logo abaixo dele).
  const shown = new Set(bestSellerIds);
  function takeUnseen(products: CatalogProductCard[], limit: number) {
    const picked = products.filter((p) => !shown.has(p.id)).slice(0, limit);
    for (const p of picked) shown.add(p.id);
    return picked;
  }

  const flashDealShelf = takeUnseen(flashDeals, SHELF_SIZE);
  const promoShelf = takeUnseen(promos, SHELF_SIZE);
  const noveltyShelf = takeUnseen(novelties, SHELF_SIZE);
  const launchShelf = takeUnseen(launches, SHELF_SIZE);
  const recommendedShelf = takeUnseen(recommended, SHELF_SIZE);

  const city = storeCityLabel(store);
  const displayedCount = roundedProductCount(totalProducts);
  const commerce = storeCommerceInfo(store);

  // Cada parte só entra se corresponder a um dado real da loja — nunca uma
  // afirmação fixa no banner (ver nota da avaliação abaixo, no botão "Comprar agora").
  const bannerTrustParts = [
    city && store.deliveryEnabled ? `Entrega em ${city}` : null,
    displayedCount >= 10 ? `Mais de ${displayedCount.toLocaleString("pt-BR")} produtos` : null,
    ratingSummary
      ? `★ ${ratingSummary.avgRating.toFixed(1)} (${ratingSummary.reviewCount} avaliações)`
      : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        {/* Banner */}
        <section>
          <div
            className="relative min-h-48 overflow-hidden rounded-2xl sm:min-h-0 sm:aspect-[16/5]"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            {store.bannerUrl && (
              // Maior elemento visível no primeiro paint da home (LCP) — carrega com
              // prioridade, sem lazy loading, ao contrário do resto das imagens do catálogo.
              <Image
                src={store.bannerUrl}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover"
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
              {bannerTrustParts.length > 0 && (
                <p className="truncate text-[10px] leading-tight text-white/90 sm:text-xs">
                  {bannerTrustParts.join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/produtos`}
              className="inline-block rounded-md px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
              style={{ backgroundColor: "var(--store-primary)" }}
            >
              Ver todos
            </Link>
            {/* "Compra segura" só aparece quando há avaliações reais que sustentem a frase — nunca fixo. */}
            {ratingSummary && (
              <span className="text-xs text-slate-500">Compra segura · avaliada por clientes reais</span>
            )}
            {store.whatsapp && (
              <a
                href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:underline"
              >
                Fale conosco no WhatsApp
              </a>
            )}
          </div>
        </section>
      </div>

      <ExpressDeliveryBanner store={store} />
      <MacroCategoryRow groups={categoryGroups} base={base} />

      {featured.length > 0 && (
        <FeaturedCarousel>
          {featured.map((product) => (
            <div key={product.id} className="w-[65%] shrink-0 snap-start sm:w-[38%] lg:w-[23%]">
              <ProductCard product={product} base={base} store={commerce} />
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

      {flashDealShelf.length > 0 && (
        <ShelfSection
          title="Ofertas relâmpago"
          subtitle="Por tempo limitado"
          href={`${base}/produtos?ordem=menor-preco`}
          products={flashDealShelf}
          base={base}
          store={commerce}
        />
      )}

      {bestSellerShelf.length > 0 && (
        <ShelfSection
          title={bestSellerShelfTitle}
          href={`${base}/produtos`}
          products={bestSellerShelf}
          base={base}
          store={commerce}
          bestSellerIds={bestSellerBadgeIds}
        />
      )}

      {promoShelf.length > 0 && (
        <ShelfSection
          title="Promoções"
          subtitle="Aproveite enquanto durar"
          href={`${base}/produtos?ordem=menor-preco`}
          products={promoShelf}
          base={base}
          store={commerce}
        />
      )}

      {noveltyShelf.length > 0 && (
        <ShelfSection
          title="Novidades"
          href={`${base}/produtos?ordem=novidades`}
          products={noveltyShelf}
          base={base}
          store={commerce}
        />
      )}

      {launchShelf.length > 0 && (
        <ShelfSection
          title="Lançamentos"
          href={`${base}/produtos?ordem=novidades`}
          products={launchShelf}
          base={base}
          store={commerce}
        />
      )}

      {recommendedShelf.length > 0 && (
        <ShelfSection
          title="Recomendados para você"
          href={`${base}/produtos`}
          products={recommendedShelf}
          base={base}
          store={commerce}
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
  store,
  bestSellerIds,
}: {
  title: string;
  subtitle?: string;
  href: string;
  products: Awaited<ReturnType<typeof listPromoProducts>>;
  base: string;
  store: ReturnType<typeof storeCommerceInfo>;
  bestSellerIds?: Set<string>;
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
      <ProductGrid products={products} base={base} store={store} bestSellerIds={bestSellerIds} />
    </section>
  );
}
