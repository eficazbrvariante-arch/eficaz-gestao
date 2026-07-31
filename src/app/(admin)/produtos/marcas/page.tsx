import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProdutosTabs } from "../produtos-tabs";
import { BrandForm } from "./brand-form";
import { deleteBrandAction } from "../actions";

export default async function MarcasPage() {
  const user = await requireUser();
  const brands = await prisma.brand.findMany({
    where: { tenantId: user.tenantId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Produtos</h1>
      <ProdutosTabs />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Nova marca</h2>
          <BrandForm />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Produtos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{brand.name}</td>
                  <td className="px-4 py-3 text-slate-500">{brand._count.products}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteBrandAction.bind(null, brand.id)}>
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline"
                        disabled={brand._count.products > 0}
                        title={
                          brand._count.products > 0
                            ? "Remova os produtos desta marca antes de excluir"
                            : undefined
                        }
                      >
                        Excluir
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    Nenhuma marca cadastrada ainda.
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
