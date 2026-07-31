import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, todayRange } from "@/lib/format";
import { canViewReports } from "@/lib/permissions";
import { needsRestock, stockStatusLabel } from "@/modules/products/stock-status";
import { getOpenCashRegister } from "@/modules/cash/cash-service";

export default async function DashboardPage() {
  const user = await requireUser();
  const { start, end } = todayRange();
  const showFinancials = canViewReports(user.role);

  const [totalProducts, activeProducts, todayTotals, topItems, register] = await Promise.all([
    prisma.product.count({ where: { tenantId: user.tenantId } }),
    prisma.product.findMany({
      where: { tenantId: user.tenantId, active: true },
      select: { id: true, name: true, stockQty: true, minStock: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId: user.tenantId,
        status: "COMPLETED",
        createdAt: { gte: start, lt: end },
      },
      _sum: { total: true, costTotal: true },
      _count: true,
    }),
    prisma.saleItem.groupBy({
      by: ["nameSnapshot"],
      where: { sale: { tenantId: user.tenantId, status: "COMPLETED" } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    getOpenCashRegister(user.tenantId),
  ]);

  const lowStock = activeProducts.filter(needsRestock);
  const revenue = Number(todayTotals._sum.total ?? 0);
  const cost = Number(todayTotals._sum.costTotal ?? 0);
  const salesCount = todayTotals._count;
  const grossProfit = revenue - cost;
  const averageTicket = salesCount > 0 ? revenue / salesCount : 0;

  const stats = [
    { label: "Faturamento hoje", value: formatBRL(revenue), restricted: true },
    { label: "Vendas hoje", value: String(salesCount), restricted: false },
    { label: "Lucro bruto hoje", value: formatBRL(grossProfit), restricted: true },
    { label: "Ticket médio", value: formatBRL(averageTicket), restricted: true },
  ].filter((stat) => showFinancials || !stat.restricted);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Resumo do dia de hoje.</p>
        </div>
        <div
          className={
            register
              ? "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              : "rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
          }
        >
          {register ? (
            <>
              Caixa aberto ·{" "}
              <Link href="/pdv" className="font-medium underline">
                ir para o PDV
              </Link>
            </>
          ) : (
            <>
              Caixa fechado ·{" "}
              <Link href="/caixa" className="font-medium underline">
                abrir caixa
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Produtos mais vendidos</h2>
            <Link href="/vendas" className="text-sm text-slate-600 hover:underline">
              Ver vendas
            </Link>
          </div>
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nenhuma venda registrada ainda. Os mais vendidos aparecerão aqui.
            </p>
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                {topItems.map((item) => (
                  <li
                    key={item.nameSnapshot}
                    className="flex items-center justify-between text-slate-700"
                  >
                    <span>{item.nameSnapshot}</span>
                    <span className="text-slate-500">{item._sum.quantity} un.</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
                Ranking por quantidade vendida, considerando todo o período. Para faturamento e
                margem por produto,{" "}
                <Link href="/relatorios/produtos" className="underline hover:text-slate-600">
                  veja os relatórios de produtos
                </Link>
                .
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Produtos a repor ({lowStock.length})
            </h2>
            <Link href="/estoque" className="text-sm text-slate-600 hover:underline">
              Ver estoque
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum produto precisando de reposição.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="flex justify-between text-slate-700">
                  <span>{p.name}</span>
                  <span className="text-red-600">
                    {p.stockQty} un. · {stockStatusLabel(p)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            {totalProducts} produto(s) cadastrado(s) no total.
          </p>
        </div>
      </div>
    </div>
  );
}
