import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { effectivePrice, type CatalogProductCard } from "@/modules/catalog/catalog-service";
import { AddToCartQuickButton } from "./add-to-cart-quick-button";

export function ProductCard({
  product,
  base,
}: {
  product: CatalogProductCard;
  base: string;
}) {
  const price = effectivePrice(product);
  const hasPromo = product.promoPrice !== null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={`${base}/produto/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square bg-slate-50">
          {product.imageUrl ? (
            // URLs de imagem são cadastradas livremente pela empresa, então o
            // domínio não é conhecido em build time para o next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain p-4"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              sem imagem
            </div>
          )}

          {hasPromo && (
            <span className="absolute left-2 top-2 rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
              Promoção
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          {product.brandName && (
            <p className="text-xs uppercase tracking-wide text-slate-400">{product.brandName}</p>
          )}
          <h3 className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">{product.name}</h3>

          <div className="mt-auto pt-3">
            {hasPromo && (
              <p className="text-xs text-red-600 line-through">{formatBRL(product.price)}</p>
            )}
            <p
              className="text-lg font-semibold"
              style={{ color: hasPromo ? "#047857" : "var(--store-primary)" }}
            >
              {formatBRL(price)}
            </p>
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
        className="absolute right-2 top-2 z-10"
      />
    </div>
  );
}

export function ProductGrid({
  products,
  base,
}: {
  products: CatalogProductCard[];
  base: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} base={base} />
      ))}
    </div>
  );
}
