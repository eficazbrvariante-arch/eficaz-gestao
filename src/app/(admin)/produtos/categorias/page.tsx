import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProdutosTabs } from "../produtos-tabs";
import { CategoryForm } from "./category-form";
import { CategoryOrderList } from "./category-order-list";

export default async function CategoriasPage() {
  const user = await requireUser();
  const categories = await prisma.category.findMany({
    where: { tenantId: user.tenantId },
    include: { parent: true, _count: { select: { products: true } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Produtos</h1>
      <ProdutosTabs />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Nova categoria</h2>
          <CategoryForm categories={categories} />
        </div>

        <div className="lg:col-span-2">
          <p className="mb-2 text-xs text-slate-500">
            Arraste pela alça (⠿) ou use as setas para reordenar. A ordem definida aqui é a
            mesma em que as categorias aparecem no catálogo online.
          </p>
          <CategoryOrderList
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              parentId: category.parentId,
              parentName: category.parent?.name ?? null,
              icon: category.icon,
              counterOnly: category.counterOnly,
              productCount: category._count.products,
            }))}
            allCategories={categories.map((category) => ({ id: category.id, name: category.name }))}
          />
        </div>
      </div>
    </div>
  );
}
