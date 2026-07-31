import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProdutosTabs } from "../produtos-tabs";
import { CategoryForm } from "./category-form";
import { deleteCategoryAction } from "../actions";

export default async function CategoriasPage() {
  const user = await requireUser();
  const categories = await prisma.category.findMany({
    where: { tenantId: user.tenantId },
    include: { parent: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Produtos</h1>
      <ProdutosTabs />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Nova categoria</h2>
          <CategoryForm categories={categories} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Categoria pai</th>
                <th className="px-4 py-3 font-medium">Produtos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{category.name}</td>
                  <td className="px-4 py-3 text-slate-500">{category.parent?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{category._count.products}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteCategoryAction.bind(null, category.id)}>
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline"
                        disabled={category._count.products > 0}
                        title={
                          category._count.products > 0
                            ? "Remova os produtos desta categoria antes de excluir"
                            : undefined
                        }
                      >
                        Excluir
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Nenhuma categoria cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
