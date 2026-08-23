import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canViewReports } from "@/lib/permissions";
import { formatBRL } from "@/lib/format";
import {
  getUniqueVisitorsToday,
  getTotalVisitsToday,
  getOnlineNowCount,
  getTodayRevenueSummary,
  getConversionRateToday,
  getMostViewedProducts,
  getMostSoldProductsToday,
  getTrafficSourceBreakdownToday,
  getDeviceBreakdownToday,
} from "@/modules/analytics/analytics-service";
import { StatCard, ShareBar, EmptyState } from "@/components/admin/stat-card";

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  GOOGLE: "Google",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  DIRECT: "Acesso direto",
  OTHER: "Outro",
};

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Celular",
  TABLET: "Tablet",
  DESKTOP: "Computador",
};

export default async function AnalyticsPage() {
  const user = await requireUser();
  if (!canViewReports(user.role)) redirect("/dashboard");

  const [
    uniqueVisitors,
    totalVisits,
    onlineNow,
    revenue,
    conversionRate,
    mostViewed,
    mostSold,
    trafficSources,
    devices,
  ] = await Promise.all([
    getUniqueVisitorsToday(user.tenantId),
    getTotalVisitsToday(user.tenantId),
    getOnlineNowCount(user.tenantId),
    getTodayRevenueSummary(user.tenantId),
    getConversionRateToday(user.tenantId),
    getMostViewedProducts(user.tenantId),
    getMostSoldProductsToday(user.tenantId),
    getTrafficSourceBreakdownToday(user.tenantId),
    getDeviceBreakdownToday(user.tenantId),
  ]);

  const maxViews = Math.max(...mostViewed.map((p) => p.views), 0);
  const maxSold = Math.max(...mostSold.map((p) => p.quantity), 0);
  const maxTraffic = Math.max(...trafficSources.map((row) => row.count), 0);
  const maxDevice = Math.max(...devices.map((row) => row.count), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-text-muted">
          Visitantes e desempenho da loja online, hoje e agora.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Visitantes únicos hoje" value={String(uniqueVisitors)} />
        <StatCard label="Visitas hoje" value={String(totalVisits)} />
        <StatCard label="Online agora" value={String(onlineNow)} tone="positive" />
        <StatCard
          label="Pedidos hoje"
          value={String(revenue.orderCount)}
          hint={`${revenue.pdvCount} no PDV · ${revenue.onlineCount} online`}
        />
        <StatCard label="Faturamento hoje" value={formatBRL(revenue.revenue)} />
        <StatCard label="Ticket médio" value={formatBRL(revenue.averageTicket)} />
        <StatCard
          label="Taxa de conversão"
          value={`${conversionRate.toFixed(1).replace(".", ",")}%`}
          hint="pedidos do catálogo online ÷ visitantes únicos"
        />
      </div>

      {uniqueVisitors === 0 ? (
        <EmptyState message="Ainda não há visitas registradas hoje. Os números aparecem aqui assim que alguém acessar a loja." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Produtos mais vistos</h2>
              {mostViewed.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma visualização de produto hoje.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {mostViewed.map((row) => (
                    <li key={row.productId}>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">{row.name}</span>
                        <span className="font-medium text-slate-900">
                          {row.views} visualiza{row.views === 1 ? "ção" : "ções"}
                        </span>
                      </div>
                      <div className="mt-1">
                        <ShareBar value={row.views} max={maxViews} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Produtos mais vendidos</h2>
              {mostSold.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma venda registrada hoje.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {mostSold.map((row) => (
                    <li key={row.name}>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">{row.name}</span>
                        <span className="font-medium text-slate-900">
                          {row.quantity} un. · {formatBRL(row.revenue)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <ShareBar value={row.quantity} max={maxSold} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Origem do acesso</h2>
              <ul className="space-y-3 text-sm">
                {trafficSources.map((row) => (
                  <li key={row.key}>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">
                        {TRAFFIC_SOURCE_LABELS[row.key] ?? row.key}
                      </span>
                      <span className="font-medium text-slate-900">{row.count}</span>
                    </div>
                    <div className="mt-1">
                      <ShareBar value={row.count} max={maxTraffic} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Dispositivo</h2>
              <ul className="space-y-3 text-sm">
                {devices.map((row) => (
                  <li key={row.key}>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">{DEVICE_LABELS[row.key] ?? row.key}</span>
                      <span className="font-medium text-slate-900">{row.count}</span>
                    </div>
                    <div className="mt-1">
                      <ShareBar value={row.count} max={maxDevice} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
