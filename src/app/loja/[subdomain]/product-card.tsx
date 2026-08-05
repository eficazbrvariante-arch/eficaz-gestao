import Link from "next/link";
import Image from "next/image";
import { formatBRL } from "@/lib/format";
import { effectivePrice, type CatalogProductCard } from "@/modules/catalog/catalog-service";
import { AddToCartQuickButton } from "./add-to-cart-quick-button";
import { FlashDealCountdown } from "./flash-deal-countdown";
import { StarIcon } from "./icons";

/** Recorte das configurações da loja que o card precisa para não fixar nada em código. */
export type StoreCommerceInfo = {
  deliveryEnabled: boolean;
  acceptedPaymentMethods: string[];
  maxInstallments: number | null;
  minInstallmentValue: number | null;
};

function computeInstallments(price: number, store: StoreCommerceInfo) {
  if (!store.maxInstallments || store.maxInstallments < 2) return null;
  const minValue = store.minInstallmentValue ?? 0;
  let count = store.maxInstallments;
  if (minValue > 0) {
    count = Math.min(count, Math.floor(price / minValue));
  }
  if (count < 2) return null;
  return { count, value: price / count };
}

export function ProductCard({
  product,
  base,
  store,
  isBestSeller = false,
}: {
  product: CatalogProductCard;
  base: string;
  store: StoreCommerceInfo;
  isBestSeller?: boolean;
}) {
  const price = effectivePrice(product);
  const hasPromo = product.promoPrice !== null;
  const acceptsPix = store.acceptedPaymentMethods.includes("PIX");
  const installments = computeInstallments(price, store);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-lg">
      <Link href={`${base}/produto/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square overflow-hidden bg-slate-50">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              loading="lazy"
              sizes="(min-width: 1024px) 23vw, (min-width: 640px) 33vw, 50vw"
              className="object-contain p-4 transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              sem imagem
            </div>
          )}

          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {product.discountPercent !== null && (
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                -{product.discountPercent}%
              </span>
            )}
            {isBestSeller && (
              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                Mais vendido
              </span>
            )}
            {product.isLowStock && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                Só restam {product.stockQty}
              </span>
            )}
          </div>

          {product.isFlashDeal && product.promoEndsAt && (
            <div className="absolute bottom-2 left-2">
              <FlashDealCountdown endsAt={product.promoEndsAt} />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3 sm:p-4">
          {product.brandName && (
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{product.brandName}</p>
          )}
          <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">{product.name}</h3>

          {product.reviewCount > 0 && product.avgRating !== null && (
            <div className="mt-1 flex items-center gap-1">
              <div className="flex text-amber-400">
                {Array.from({ length: 5 }, (_, i) => (
                  <StarIcon key={i} filled={i < Math.round(product.avgRating!)} className="h-3 w-3" />
                ))}
              </div>
              <span className="text-[11px] text-slate-500">({product.reviewCount})</span>
            </div>
          )}

          <div className="mt-auto pt-2">
            {product.strikePrice !== null && (
              <p className="text-xs text-slate-500 line-through">{formatBRL(product.strikePrice)}</p>
            )}
            <p
              className="text-lg font-semibold"
              style={{ color: hasPromo ? "#047857" : "var(--store-primary)" }}
            >
              {formatBRL(price)}
            </p>
            {acceptsPix && (
              <p className="text-[11px] text-emerald-700">{formatBRL(price)} no Pix</p>
            )}
            {installments && (
              <p className="text-[11px] text-slate-500">
                até {installments.count}x de {formatBRL(installments.value)}
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap gap-1">
              {product.stockQty > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  Pronta Entrega
                </span>
              )}
              {store.deliveryEnabled && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  Entrega Expressa
                </span>
              )}
            </div>

            {product.soldQty > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">{product.soldQty} vendidos</p>
            )}
          </div>
        </div>
      </Link>

      {/* Fica fora do <Link> (irmão, não descendente) para não aninhar botão
          dentro de âncora — clicar aqui não navega para a página do produto. */}
      <AddToCartQuickButton
        product={{
          id: product.id,
          name: product.name,
          unitPrice: price,
          imageUrl: product.imageUrl,
          stockQty: product.stockQty,
        }}
        className="absolute right-2 top-2 z-10 opacity-90 transition-opacity duration-150 hover:opacity-100"
      />
    </div>
  );
}

export function ProductGrid({
  products,
  base,
  store,
  bestSellerIds,
}: {
  products: CatalogProductCard[];
  base: string;
  store: StoreCommerceInfo;
  bestSellerIds?: Set<string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          base={base}
          store={store}
          isBestSeller={bestSellerIds?.has(product.id) ?? false}
        />
      ))}
    </div>
  );
}
