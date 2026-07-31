import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "../product-form";

export default async function NovoProdutoPage() {
  const user = await requireUser();
  const [categories, brands, suppliers] = await Promise.all([
    prisma.category.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Novo produto</h1>
      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ProductForm categories={categories} brands={brands} suppliers={suppliers} />
      </div>
    </div>
  );
}
