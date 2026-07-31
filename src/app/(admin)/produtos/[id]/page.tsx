import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "../product-form";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const [product, categories, brands, suppliers] = await Promise.all([
    prisma.product.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { images: true, variants: true },
    }),
    prisma.category.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
  ]);

  if (!product) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Editar produto</h1>
      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ProductForm
          productId={product.id}
          categories={categories}
          brands={brands}
          suppliers={suppliers}
          defaultValues={{
            name: product.name,
            internalCode: product.internalCode ?? "",
            barcode: product.barcode ?? "",
            categoryId: product.categoryId ?? "",
            brandId: product.brandId ?? "",
            supplierId: product.supplierId ?? "",
            description: product.description ?? "",
            costPrice: Number(product.costPrice),
            salePrice: Number(product.salePrice),
            promoPrice: product.promoPrice ? Number(product.promoPrice) : undefined,
            stockQty: product.stockQty,
            minStock: product.minStock,
            active: product.active,
            showInCatalog: product.showInCatalog,
            imageUrl: product.images[0]?.url ?? "",
            variants: product.variants.map((v) => ({
              name: v.name,
              sku: v.sku ?? "",
              barcode: v.barcode ?? "",
              priceAdjustment: Number(v.priceAdjustment),
              stockQty: v.stockQty,
            })),
          }}
        />
      </div>
    </div>
  );
}
