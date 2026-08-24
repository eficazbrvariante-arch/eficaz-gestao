import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canEditCommission, canManageEmployeeLedger } from "@/lib/permissions";
import { periodRange } from "@/lib/format";
import { getCommissionRanking, COMMISSION_POLICY_EFFECTIVE_AT_ISO } from "@/modules/employees/commission-service";
import { resolvePeriod } from "../../relatorios/period";
import { PeriodPicker } from "../../relatorios/report-nav";
import { RankingComissaoMatrix } from "./ranking-comissao-matrix";

export default async function RankingComissaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o ranking de comissão.
      </div>
    );
  }

  // Padrão: todo o histórico de comissão, desde que a alíquota entrou em
  // vigor (não existe comissão antes disso) — o usuário troca o período
  // pelo PeriodPicker quando quiser olhar só hoje ou uma janela menor.
  const period = resolvePeriod(await searchParams, { defaultFrom: COMMISSION_POLICY_EFFECTIVE_AT_ISO });
  const { start, end } = periodRange(period.from, period.to);
  const ranking = await getCommissionRanking(user.tenantId, { start, end });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Ranking de Comissão</h1>
          <p className="text-sm text-text-muted">
            Comissão efetiva de cada vendedor no período — quanto do que vendeu virou comissão, do
            maior pro menor.
          </p>
        </div>
        {canEditCommission(user.role) && (
          <Link
            href="/colaboradores/ranking-comissao/configuracoes"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Configurações de Comissão
          </Link>
        )}
      </div>

      <PeriodPicker period={period} />

      <RankingComissaoMatrix rows={ranking} period={period} />
    </div>
  );
}
