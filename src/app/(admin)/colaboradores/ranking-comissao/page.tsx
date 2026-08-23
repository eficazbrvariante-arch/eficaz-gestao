import { requireUser } from "@/lib/session";
import { canManageEmployeeLedger } from "@/lib/permissions";
import { todayISO, periodRange } from "@/lib/format";
import { getCommissionRanking } from "@/modules/employees/commission-service";
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

  // Padrão "hoje" (placar do dia) em vez do mês inteiro — o usuário troca o
  // período pelo PeriodPicker quando quiser olhar outra janela.
  const period = resolvePeriod(await searchParams, { defaultFrom: todayISO() });
  const { start, end } = periodRange(period.from, period.to);
  const ranking = await getCommissionRanking(user.tenantId, { start, end });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Ranking de Comissão</h1>
      <p className="mb-6 text-sm text-text-muted">
        Comissão efetiva de cada vendedor no período — quanto do que vendeu virou comissão, do
        maior pro menor.
      </p>

      <PeriodPicker period={period} />

      <RankingComissaoMatrix rows={ranking} period={period} />
    </div>
  );
}
