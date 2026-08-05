import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canResetStockCheckQueue } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { needsRestock, stockStatusLabel } from "@/modules/products/stock-status";
import { ResetStockCheckButton } from "./reset-stock-check-button";

const TYPE_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Saída",
  ADJUST: "Ajuste",
  SALE: "Venda (PDV)",
  CANCEL_RETURN: "Devolução",
  ORDER: "Pedido online",
  ORDER_RETURN: "Devolução de pedido",
};

export default async function EstoquePage() {
  const user = await requireUser();
  const canResetQueue = canResetStockCheckQueue(user.role);

  const [lowStockProducts, movements, pendingStockCheck, totalActive] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: user.tenantId, active: true },
      orderBy: { stockQty: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId: user.tenantId },
      include: { product: true, user: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    canResetQueue
      ? prisma.product.count({
          where: { tenantId: user.tenantId, active: true, lastStockCheckAt: null },
        })
      : Promise.resolve(0),
    canResetQueue
      ? prisma.product.count({ where: { tenantId: user.tenantId, active: true } })
      : Promise.resolve(0),
  ]);

  const alerts = lowStockProducts.filter(needsRestock);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Estoque</h1>
          <p className="text-sm text-slate-500">
            Movimentações, alertas de estoque baixo e inventário.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/estoque/inventario"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Inventário
          </Link>
          <Link
            href="/estoque/novo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Novo lançamento
          </Link>
        </div>
      </div>

      {canResetQueue && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-900">Contagem do Colaborador de Estoque</p>
            <p className="text-sm text-slate-500">
              {totalActive - pendingStockCheck} de {totalActive} produto(s) já confirmados neste
              ciclo.
            </p>
          </div>
          <ResetStockCheckButton />
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-medium text-red-800">
            {alerts.length} produto(s) precisando de reposição
          </p>
          <ul className="space-y-1 text-sm text-red-700">
            {alerts.slice(0, 10).map((p) => (
              <li key={p.id}>
                {p.name} — {p.stockQty} em estoque
                {p.minStock > 0 && ` (mínimo ${p.minStock})`} · {stockStatusLabel(p)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Últimas movimentações
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Quantidade</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Usuário</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">
                  {m.createdAt.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-slate-900">{m.product.name}</td>
                <td className="px-4 py-3 text-slate-700">{TYPE_LABELS[m.type]}</td>
                <td
                  className={
                    m.quantity < 0 ? "px-4 py-3 text-red-600" : "px-4 py-3 text-emerald-700"
                  }
                >
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td className="px-4 py-3 text-slate-500">{m.reason ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {m.user?.name ?? "Pedido online"}
                </td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma movimentação registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
