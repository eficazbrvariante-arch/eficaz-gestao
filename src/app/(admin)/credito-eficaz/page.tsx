import { requireTenant } from "@/lib/session";
import { canManageCreditoEficaz } from "@/lib/permissions";
import { StatCard } from "@/components/admin/stat-card";
import { formatBRL, formatDate } from "@/lib/format";
import {
  getExposureSummary,
  listApplicationsForAdmin,
  getPortfolioHealth,
  getCreditCohorts,
} from "@/modules/credito-eficaz/credito-eficaz-service";
import { CreditoEficazLista } from "./credito-eficaz-lista";
import { CreditoEficazPauseToggle } from "./credito-eficaz-pause-toggle";
import { CreditoEficazConfigPanel } from "./credito-eficaz-config-panel";

export default async function CreditoEficazPage() {
  const { user, tenant } = await requireTenant();
  if (!canManageCreditoEficaz(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o Crédito Eficaz.
      </div>
    );
  }

  const [exposure, applications, health, cohorts] = await Promise.all([
    getExposureSummary(user.tenantId),
    listApplicationsForAdmin(user.tenantId),
    getPortfolioHealth(user.tenantId),
    getCreditCohorts(user.tenantId),
  ]);

  const exposureLimit = tenant.creditoEficazExposureLimit != null ? Number(tenant.creditoEficazExposureLimit) : null;
  const exposureRatio = exposureLimit && exposureLimit > 0 ? health.totalUsed / exposureLimit : null;

  const alerts: { message: string; tone: "warning" | "danger" }[] = [];
  if (health.overdueCount > 0) {
    alerts.push({
      message: `${health.overdueCount} parcela(s) vencida(s), totalizando ${formatBRL(health.totalOverdue)}.`,
      tone: "danger",
    });
  }
  if (exposureRatio != null && exposureRatio >= 1) {
    alerts.push({ message: "Teto global de exposição atingido — novo uso pode ser recusado.", tone: "danger" });
  } else if (exposureRatio != null && exposureRatio >= 0.8) {
    alerts.push({
      message: `Exposição já em ${Math.round(exposureRatio * 100)}% do teto global configurado.`,
      tone: "warning",
    });
  }
  if (tenant.creditoEficazPaused) {
    alerts.push({ message: "Crédito Eficaz está pausado — nenhum novo uso é aceito no momento.", tone: "warning" });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Crédito Eficaz</h1>
          <p className="text-sm text-text-muted">
            Piloto controlado — toda aprovação, limite e bloqueio é decisão manual. Crédito cresce quando
            os dados mostrarem que a carteira está saudável, não por vontade de emprestar mais.
          </p>
        </div>
        <CreditoEficazPauseToggle initialPaused={tenant.creditoEficazPaused} />
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`rounded-md p-3 text-sm ${
                alert.tone === "danger" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {alert.message}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Limite concedido" value={formatBRL(exposure.totalLimit)} />
        <StatCard label="Utilizado" value={formatBRL(exposure.totalUsed)} />
        <StatCard label="Disponível" value={formatBRL(exposure.totalAvailable)} tone="positive" />
        <StatCard label="Em aberto" value={formatBRL(exposure.totalOpen)} />
        <StatCard
          label="Vencido"
          value={formatBRL(exposure.totalOverdue)}
          tone={exposure.totalOverdue > 0 ? "negative" : "default"}
        />
        <StatCard label="Solicitações pendentes" value={String(exposure.pendingApplications)} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Saúde do Crédito Eficaz</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Clientes aprovados" value={String(health.approvedCustomers)} />
          <StatCard label="Clientes utilizando" value={String(health.activeCustomers)} />
          <StatCard label="Recebido" value={formatBRL(health.totalReceived)} tone="positive" />
          <StatCard label="A vencer" value={formatBRL(health.totalUpcoming)} />
          <StatCard
            label="% da carteira vencida"
            value={`${health.overduePercent.toFixed(1)}%`}
            tone={health.overduePercent > 0 ? "negative" : "default"}
          />
          <StatCard label="Ticket médio financiado" value={formatBRL(health.averageTicket)} />
          <StatCard label="Entrada média (OS)" value={formatBRL(health.averageDownPayment)} />
          <StatCard label="Prazo médio" value={`${health.averageTermDays} dias`} />
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Pontualidade (por parcela paga): {health.paidOnTimeCount} no prazo, {health.paidLateCount} com
          atraso.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Decisão do Piloto</h2>
        <p className="mb-3 text-xs text-slate-500">
          Só leitura — o sistema nunca recomenda aumentar o crédito. A decisão (manter, ampliar, reduzir
          exposição, pausar) é sempre manual.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Exposição atual" value={formatBRL(health.totalUsed)} />
          <StatCard label="Recebido" value={formatBRL(health.totalReceived)} />
          <StatCard label="A vencer" value={formatBRL(health.totalUpcoming)} />
          <StatCard
            label="Vencido"
            value={formatBRL(health.totalOverdue)}
            tone={health.totalOverdue > 0 ? "negative" : "default"}
          />
        </div>
      </div>

      {cohorts.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Safra (por mês de aprovação)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-4 py-2 font-medium">Clientes</th>
                  <th className="px-4 py-2 font-medium">Utilizado</th>
                  <th className="px-4 py-2 font-medium">Recebido</th>
                  <th className="px-4 py-2 font-medium">A vencer</th>
                  <th className="px-4 py-2 font-medium">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.monthStartISO} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 text-slate-900">{formatDate(new Date(`${cohort.monthStartISO}T12:00:00-03:00`))}</td>
                    <td className="px-4 py-2 text-slate-500">{cohort.approvedCustomers}</td>
                    <td className="px-4 py-2 text-slate-900">{formatBRL(cohort.totalUsed)}</td>
                    <td className="px-4 py-2 text-emerald-700">{formatBRL(cohort.totalReceived)}</td>
                    <td className="px-4 py-2 text-slate-500">{formatBRL(cohort.totalUpcoming)}</td>
                    <td className="px-4 py-2 text-red-600">{formatBRL(cohort.totalOverdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Configuração do programa</h2>
        <CreditoEficazConfigPanel
          initialExposureLimit={exposureLimit}
          initialMaxInstallments={tenant.creditoEficazMaxInstallments}
        />
      </div>

      <CreditoEficazLista applications={applications} />
    </div>
  );
}
