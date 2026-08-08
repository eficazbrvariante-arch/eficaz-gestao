import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getStoreBySubdomain,
  storeDisplayName,
  storeCommerceInfo,
  storeOrigin,
} from "@/modules/catalog/tenant-resolver";
import {
  getCatalogProduct,
  listRelatedProducts,
  listFrequentlyBoughtWith,
} from "@/modules/catalog/catalog-service";
import { formatBRL, formatDateTime } from "@/lib/format";
import { ProductGrid } from "../../product-card";
import { ProductGallery } from "./product-gallery";
import { AddToCart } from "./add-to-cart";
import { WhatsappProductCta } from "./whatsapp-product-cta";
import { StarIcon } from "../../icons";
import { FlashDealCountdown } from "../../flash-deal-countdown";
import { RecentlyViewedTracker } from "./recently-viewed-tracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string; id: string }>;
}): Promise<Metadata> {
  const { subdomain, id } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) return { title: "Produto não encontrado" };

  const product = await getCatalogProduct(store.id, id);
  if (!product) return { title: "Produto não encontrado" };

  const imageUrl = product.images[0]?.url;

  return {
    title: `${product.name} — ${storeDisplayName(store)}`,
    description: product.description ?? undefined,
    openGraph: {
      title: product.name,
      description: product.description ?? undefined,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
  };
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ subdomain: string; id: string }>;
}) {
  const { subdomain, id } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const product = await getCatalogProduct(store.id, id);
  if (!product) notFound();

  const base = `/loja/${store.subdomain}`;
  const [related, boughtTogether] = await Promise.all([
    listRelatedProducts(store.id, product.id, product.categoryId),
    listFrequentlyBoughtWith(store.id, product.id),
  ]);

  const commerce = storeCommerceInfo(store);
  const price = Number(product.salePrice);
  const promoPrice = product.promoPrice === null ? null : Number(product.promoPrice);
  const basePrice = promoPrice ?? price;
  const acceptsPix = commerce.acceptedPaymentMethods.includes("PIX");

  // Dado estruturado (schema.org/Product) pra busca e compartilhamento —
  // escapa "</" pra uma descrição não conseguir fechar a tag <script> cedo.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images.map((image) => image.url),
    description: product.description ?? undefined,
    offers: {
      "@type": "Offer",
      price: basePrice.toFixed(2),
      priceCurrency: "BRL",
      availability:
        product.stockQty > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${storeOrigin(store)}${base}/produto/${product.id}`,
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c") }}
      />
      <RecentlyViewedTracker subdomain={store.subdomain} productId={product.id} />
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href={base} className="hover:underline">
          Início
        </Link>
        <span>/</span>
        <Link href={`${base}/produtos`} className="hover:underline">
          Produtos
        </Link>
        {product.category && (
          <>
            <span>/</span>
            <Link
              href={`${base}/produtos?categoria=${product.category.id}`}
              className="hover:underline"
            >
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProductGallery images={product.images} alt={product.name} />

        <div>
          {product.brand && (
            <p className="text-xs uppercase tracking-wide text-slate-500">{product.brand.name}</p>
          )}
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.name}</h1>

          {product.reviewCount > 0 && product.avgRating !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex text-amber-400">
                {Array.from({ length: 5 }, (_, i) => (
                  <StarIcon key={i} filled={i < Math.round(product.avgRating!)} className="h-4 w-4" />
                ))}
              </div>
              <span className="text-sm text-slate-500">
                {product.avgRating.toFixed(1)} · {product.reviewCount} avaliaç
                {product.reviewCount === 1 ? "ão" : "ões"}
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {commerce.deliveryEnabled && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                Entrega Expressa
              </span>
            )}
            {product.isFlashDeal && product.promoEndsAt && (
              <FlashDealCountdown endsAt={product.promoEndsAt} />
            )}
          </div>

          <div className="mt-4">
            {product.strikePrice !== null && (
              <p className="text-sm text-slate-500 line-through">{formatBRL(product.strikePrice)}</p>
            )}
            {promoPrice !== null && product.strikePrice === null && (
              <p className="text-sm text-slate-500 line-through">{formatBRL(price)}</p>
            )}
            {product.discountPercent !== null && (
              <span className="text-sm font-semibold text-emerald-700">
                -{product.discountPercent}%
              </span>
            )}
          </div>

          {acceptsPix && (
            <p className="mt-1 text-sm text-emerald-700">{formatBRL(basePrice)} no Pix</p>
          )}
          {product.soldQty > 0 && (
            <p className="mt-1 text-xs text-slate-500">{product.soldQty} vendidos</p>
          )}
          {product.promoRemaining !== null && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Restam {product.promoRemaining} na promoção
            </p>
          )}

          <div className="mt-4">
            <AddToCart
              productId={product.id}
              productName={product.name}
              basePrice={basePrice}
              ignoreVariantAdjustment={product.hasFlashOverride}
              stockQty={product.stockQty}
              imageUrl={product.images[0]?.url ?? null}
              variants={product.variants.map((v) => ({
                id: v.id,
                name: v.name,
                priceAdjustment: Number(v.priceAdjustment),
                stockQty: v.stockQty,
              }))}
              cartHref={`${base}/carrinho`}
            />
            {store.whatsapp && (
              <WhatsappProductCta
                whatsapp={store.whatsapp}
                productName={product.name}
                priceLabel={formatBRL(basePrice)}
                productUrl={`${storeOrigin(store)}${base}/produto/${product.id}`}
              />
            )}
          </div>

          {product.description && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Descrição</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {product.description}
              </p>
            </div>
          )}

          {product.reviews.length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Avaliações</h2>
              <div className="space-y-4">
                {product.reviews.map((review) => (
                  <div key={review.id}>
                    <div className="flex items-center gap-2">
                      <div className="flex text-amber-400">
                        {Array.from({ length: 5 }, (_, i) => (
                          <StarIcon key={i} filled={i < review.rating} className="h-3.5 w-3.5" />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-slate-900">{review.authorName}</span>
                      {review.customerId && (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          Compra verificada
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{formatDateTime(review.createdAt)}</span>
                    </div>
                    {review.comment && (
                      <p className="mt-1 text-sm text-slate-600">{review.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {boughtTogether.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Quem comprou este item também comprou
          </h2>
          <ProductGrid products={boughtTogether} base={base} store={commerce} />
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Produtos relacionados</h2>
          <ProductGrid products={related} base={base} store={commerce} />
        </section>
      )}
    </div>
  );
}
