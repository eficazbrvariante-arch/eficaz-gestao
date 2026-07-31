import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { effectivePrice, type CatalogProductCard } from "@/modules/catalog/catalog-service";

export function ProductCard({
  product,
  base,
}: {
  product: CatalogProductCard;
  base: string;
}) {
  const price = effectivePrice(product);
  const hasPromo = product.promoPrice !== null;
  const outOfStock = product.stockQty <= 0;

  return (
    <Link
      href={`${base}/produto/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
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

        {hasPromo && !outOfStock && (
          <span className="absolute left-2 top-2 rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
            Promoção
          </span>
        )}
        {outOfStock && (
          <span className="absolute left-2 top-2 rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">
            Esgotado
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
            <p className="text-xs text-slate-400 line-through">{formatBRL(product.price)}</p>
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
