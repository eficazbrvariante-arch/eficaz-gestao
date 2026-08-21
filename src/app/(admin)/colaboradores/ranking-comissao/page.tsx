import { requireUser } from "@/lib/session";
import { canManageEmployeeLedger } from "@/lib/permissions";
import { getCommissionRanking } from "@/modules/employees/commission-service";
import { RankingComissaoMatrix } from "./ranking-comissao-matrix";

export default async function RankingComissaoPage() {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o ranking de comissão.
      </div>
    );
  }

  const ranking = await getCommissionRanking(user.tenantId);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Ranking de Comissão</h1>
      <p className="mb-6 text-sm text-slate-500">
        Comissão efetiva de cada vendedor — quanto do que vendeu virou comissão, do maior pro
        menor.
      </p>

      <RankingComissaoMatrix rows={ranking} />
    </div>
  );
}
