import { requireUser } from "@/lib/session";
import { canManageCreditoEficaz } from "@/lib/permissions";
import { StatCard } from "@/components/admin/stat-card";
import { formatBRL } from "@/lib/format";
import {
  getExposureSummary,
  listApplicationsForAdmin,
} from "@/modules/credito-eficaz/credito-eficaz-service";
import { CreditoEficazLista } from "./credito-eficaz-lista";

export default async function CreditoEficazPage() {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o Crédito Eficaz.
      </div>
    );
  }

  const [exposure, applications] = await Promise.all([
    getExposureSummary(user.tenantId),
    listApplicationsForAdmin(user.tenantId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Crédito Eficaz</h1>
        <p className="text-sm text-text-muted">
          Protótipo 1 — toda aprovação, limite e bloqueio é decisão manual. Solicitações abaixo,
          gestão de limite/bloqueio/pagamento na ficha de cada cliente.
        </p>
      </div>

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

      <CreditoEficazLista applications={applications} />
    </div>
  );
}
