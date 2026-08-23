import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canViewReports } from "@/lib/permissions";
import { formatBRL, formatISODate, formatDateTime } from "@/lib/format";
import { ORDER_PAYMENT_LABELS } from "@/modules/orders/order-status";
import {
  getSalesSummary,
  getDailyRevenue,
  getRevenueByPaymentMethod,
  getRevenueBySeller,
  getCancellations,
} from "@/modules/reports/report-service";
import { StatCard, ShareBar, EmptyState } from "@/components/admin/stat-card";
import { ReportTabs, PeriodPicker, ExportButton } from "./report-nav";
import { resolvePeriod } from "./period";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  if (!canViewReports(user.role)) redirect("/dashboard");

  const period = resolvePeriod(await searchParams);

  const [summary, daily, byPayment, bySeller, cancellations] = await Promise.all([
    getSalesSummary(user.tenantId, period),
    getDailyRevenue(user.tenantId, period),
    getRevenueByPaymentMethod(user.tenantId, period),
    getRevenueBySeller(user.tenantId, period),
    getCancellations(user.tenantId, period),
  ]);

  const maxDaily = Math.max(...daily.map((d) => d.revenue), 0);
  const maxPayment = Math.max(...byPayment.map((p) => p.amount), 0);
  const maxSeller = Math.max(...bySeller.map((s) => s.revenue), 0);
  const hasSales = summary.orderCount > 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-text-muted">
            {formatISODate(period.from)} a {formatISODate(period.to)} · vendas do PDV e pedidos
            do catálogo já concluídos
          </p>
        </div>
        <ExportButton report="vendas" period={period} />
      </div>

      <ReportTabs period={period} />
      <PeriodPicker period={period} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Faturamento" value={formatBRL(summary.revenue)} />
        <StatCard
          label="Lucro bruto"
          value={formatBRL(summary.grossProfit)}
          hint={`margem de ${summary.marginPercent.toFixed(1).replace(".", ",")}%`}
          tone={summary.grossProfit >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Vendas"
          value={String(summary.orderCount)}
          hint={`${summary.pdvCount} no PDV · ${summary.onlineCount} online`}
        />
        <StatCard label="Ticket médio" value={formatBRL(summary.averageTicket)} />
      </div>

      {!hasSales ? (
        <EmptyState message="Nenhuma venda registrada neste período." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Origem do faturamento */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">
                Faturamento por origem
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Balcão (PDV)</dt>
                  <dd className="font-medium text-slate-900">
                    {formatBRL(summary.pdvRevenue)}
                  </dd>
                </div>
                <ShareBar value={summary.pdvRevenue} max={summary.revenue} />
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Catálogo online</dt>
                  <dd className="font-medium text-slate-900">
                    {formatBRL(summary.onlineRevenue)}
                  </dd>
                </div>
                <ShareBar value={summary.onlineRevenue} max={summary.revenue} />
              </dl>

              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Custo dos produtos vendidos</span>
                  <span>{formatBRL(summary.cost)}</span>
                </div>
                {summary.deliveryFees > 0 && (
                  <div className="flex justify-between">
                    <span>Taxas de entrega cobradas</span>
                    <span>{formatBRL(summary.deliveryFees)}</span>
                  </div>
                )}
                <p className="pt-1 text-slate-400">
                  O lucro bruto desconta o custo dos produtos e as taxas de entrega, que são
                  repasse e não margem.
                </p>
              </div>
            </section>

            {/* Formas de pagamento */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">
                Por forma de pagamento
              </h2>
              <ul className="space-y-3 text-sm">
                {byPayment.map((row) => (
                  <li key={row.method}>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">
                        {ORDER_PAYMENT_LABELS[row.method] ?? row.method}
                      </span>
                      <span className="font-medium text-slate-900">
                        {formatBRL(row.amount)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ShareBar value={row.amount} max={maxPayment} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Por vendedor */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Por vendedor</h2>
            <ul className="space-y-3 text-sm">
              {bySeller.map((row) => (
                <li key={row.name}>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">
                      {row.name}{" "}
                      <span className="text-xs text-slate-400">
                        ({row.count} venda{row.count === 1 ? "" : "s"})
                      </span>
                    </span>
                    <span className="font-medium text-slate-900">{formatBRL(row.revenue)}</span>
                  </div>
                  <div className="mt-1">
                    <ShareBar value={row.revenue} max={maxSeller} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Dia a dia */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
              Faturamento dia a dia
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {daily.map((day) => (
                    <tr key={day.date} className="border-b border-slate-100 last:border-0">
                      <td className="w-28 px-5 py-2 text-slate-600">
                        {formatISODate(day.date)}
                      </td>
                      <td className="px-2 py-2">
                        <ShareBar value={day.revenue} max={maxDaily} />
                      </td>
                      <td className="w-16 px-2 py-2 text-right text-xs text-slate-400">
                        {day.count > 0 ? `${day.count}x` : ""}
                      </td>
                      <td className="w-32 px-5 py-2 text-right font-medium text-slate-900">
                        {day.revenue > 0 ? formatBRL(day.revenue) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Cancelamentos */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Cancelamentos</h2>
          <span className="text-sm text-slate-500">
            {summary.cancelledCount} · {formatBRL(summary.cancelledValue)}
          </span>
        </div>
        {cancellations.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">
            Nenhum cancelamento neste período.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Origem</th>
                <th className="px-5 py-2 font-medium">Referência</th>
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="px-5 py-2 font-medium">Motivo</th>
                <th className="px-5 py-2 font-medium">Responsável</th>
                <th className="px-5 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {cancellations.map((row) => (
                <tr
                  key={`${row.origin}-${row.reference}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-5 py-2 text-slate-500">{row.origin}</td>
                  <td className="px-5 py-2 text-slate-900">{row.reference}</td>
                  <td className="px-5 py-2 text-slate-500">{formatDateTime(row.date)}</td>
                  <td className="px-5 py-2 text-slate-600">{row.reason ?? "-"}</td>
                  <td className="px-5 py-2 text-slate-500">{row.responsible ?? "-"}</td>
                  <td className="px-5 py-2 text-right text-slate-900">
                    {formatBRL(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
