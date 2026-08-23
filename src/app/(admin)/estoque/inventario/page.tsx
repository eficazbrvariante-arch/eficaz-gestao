import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { adjustInventoryAction } from "../actions";
import { Button } from "@/components/ui/button";

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ sucesso?: string }>;
}) {
  const { sucesso } = await searchParams;
  const user = await requireUser();
  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, active: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Inventário</h1>
      <p className="mb-6 text-sm text-text-muted">
        Informe a quantidade contada fisicamente para cada produto. Só os produtos com quantidade
        alterada geram um ajuste de estoque.
      </p>

      {sucesso && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Inventário salvo com sucesso.
        </div>
      )}

      <form action={adjustInventoryAction}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Estoque no sistema</th>
                <th className="px-4 py-3 font-medium">Quantidade contada</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{product.name}</td>
                  <td className="px-4 py-3 text-slate-500">{product.stockQty}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      name={`qty_${product.id}`}
                      defaultValue={product.stockQty}
                      min={0}
                      step={1}
                      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    Nenhum produto ativo para inventariar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {products.length > 0 && (
          <div className="mt-4">
            <Button type="submit" fullWidth={false} className="px-6">
              Salvar inventário
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
