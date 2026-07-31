import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canViewReports } from "@/lib/permissions";
import { formatBRL, formatISODate } from "@/lib/format";
import { needsRestock, stockStatusLabel } from "@/modules/products/stock-status";
import {
  getProductPerformance,
  getStaleProducts,
} from "@/modules/reports/report-service";
import { EmptyState } from "@/components/admin/stat-card";
import { ReportTabs, PeriodPicker, ExportButton } from "../report-nav";
import { resolvePeriod } from "../period";

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export default async function RelatorioProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  if (!canViewReports(user.role)) redirect("/dashboard");

  const period = resolvePeriod(await searchParams);

  const [performance, stale, activeProducts] = await Promise.all([
    getProductPerformance(user.tenantId, period),
    getStaleProducts(user.tenantId, period),
    prisma.product.findMany({
      where: { tenantId: user.tenantId, active: true },
      select: {
        id: true,
        name: true,
        stockQty: true,
        minStock: true,
        costPrice: true,
      },
      orderBy: { stockQty: "asc" },
    }),
  ]);

  const bestSellers = [...performance].sort((a, b) => b.quantity - a.quantity).slice(0, 15);
  // Só entram no ranking de margem produtos que realmente venderam no período.
  const bestMargin = [...performance]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.marginPercent - a.marginPercent)
    .slice(0, 15);

  const lowStock = activeProducts.filter(needsRestock);
  const stockValue = activeProducts.reduce(
    (sum, product) => sum + Number(product.costPrice) * product.stockQty,
    0
  );
  const staleValue = stale.reduce((sum, product) => sum + product.stockValue, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Relatórios de produtos</h1>
          <p className="text-sm text-slate-500">
            {formatISODate(period.from)} a {formatISODate(period.to)}
          </p>
        </div>
        <ExportButton report="produtos" period={period} />
      </div>

      <ReportTabs period={period} />
      <PeriodPicker period={period} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Mais vendidos */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
            Mais vendidos no período
          </div>
          {bestSellers.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">
              Nenhuma venda neste período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-5 py-2 text-right font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {bestSellers.map((product) => (
                  <tr key={product.name} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2 text-slate-900">{product.name}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{product.quantity}</td>
                    <td className="px-5 py-2 text-right text-slate-900">
                      {formatBRL(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Maior margem */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Maior margem</h2>
            <p className="text-xs text-slate-400">
              Margem realizada no período: preço vendido menos o custo registrado na venda.
            </p>
          </div>
          {bestMargin.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">
              Nenhuma venda neste período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Margem</th>
                  <th className="px-5 py-2 text-right font-medium">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {bestMargin.map((product) => (
                  <tr key={product.name} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2 text-slate-900">{product.name}</td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatPercent(product.marginPercent)}
                    </td>
                    <td
                      className={
                        product.profit >= 0
                          ? "px-5 py-2 text-right text-emerald-700"
                          : "px-5 py-2 text-right text-red-600"
                      }
                    >
                      {formatBRL(product.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Estoque baixo */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Produtos a repor</h2>
            <Link href="/estoque" className="text-xs text-slate-500 hover:underline">
              Ir para o estoque
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">
              Nenhum produto precisando de reposição.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Estoque</th>
                  <th className="px-5 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2 text-slate-900">{product.name}</td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {product.stockQty}
                      {product.minStock > 0 && (
                        <span className="text-xs text-slate-400"> / mín. {product.minStock}</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-xs text-red-600">
                      {stockStatusLabel(product)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Produtos parados */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Produtos parados</h2>
            <p className="text-xs text-slate-400">
              Em estoque, mas sem nenhuma venda no período — {formatBRL(staleValue)} parados.
            </p>
          </div>
          {stale.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">
              Todos os produtos com estoque tiveram alguma venda.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 text-right font-medium">Estoque</th>
                    <th className="px-5 py-2 text-right font-medium">Valor parado</th>
                  </tr>
                </thead>
                <tbody>
                  {stale.map((product) => (
                    <tr key={product.name} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-2 text-slate-900">{product.name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{product.stockQty}</td>
                      <td className="px-5 py-2 text-right text-slate-900">
                        {formatBRL(product.stockValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Valor total em estoque (a preço de custo):{" "}
        <span className="font-medium text-slate-900">{formatBRL(stockValue)}</span>
      </p>

      {performance.length === 0 && stale.length === 0 && (
        <div className="mt-6">
          <EmptyState message="Sem dados de produtos para este período." />
        </div>
      )}
    </div>
  );
}
