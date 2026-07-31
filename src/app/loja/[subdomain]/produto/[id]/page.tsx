import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getStoreBySubdomain,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import {
  getCatalogProduct,
  listRelatedProducts,
} from "@/modules/catalog/catalog-service";
import { formatBRL } from "@/lib/format";
import { ProductGrid } from "../../product-card";
import { ProductGallery } from "./product-gallery";
import { AddToCart } from "./add-to-cart";

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

  return {
    title: `${product.name} — ${storeDisplayName(store)}`,
    description: product.description ?? undefined,
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
  const related = await listRelatedProducts(store.id, product.id, product.categoryId);

  const price = Number(product.salePrice);
  const promoPrice = product.promoPrice === null ? null : Number(product.promoPrice);
  const basePrice = promoPrice ?? price;

  return (
    <div>
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
            <p className="text-xs uppercase tracking-wide text-slate-400">{product.brand.name}</p>
          )}
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.name}</h1>

          {promoPrice !== null && (
            <p className="mt-3 text-sm text-slate-400 line-through">{formatBRL(price)}</p>
          )}

          <div className="mt-4">
            <AddToCart
              productId={product.id}
              productName={product.name}
              basePrice={basePrice}
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
          </div>

          {product.description && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Descrição</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Produtos relacionados</h2>
          <ProductGrid products={related} base={base} />
        </section>
      )}
    </div>
  );
}
