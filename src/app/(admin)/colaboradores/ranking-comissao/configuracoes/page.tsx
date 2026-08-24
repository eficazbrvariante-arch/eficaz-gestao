import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canEditCommission } from "@/lib/permissions";
import { currentMonthStartISO, formatBRL } from "@/lib/format";
import { getTierSetForMonth, getEditableTiersForNextMonth } from "@/modules/employees/commission-tier-service";
import { CommissionTiersForm } from "../commission-tiers-form";

export default async function ConfiguracoesComissaoPage() {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para configurar as faixas de comissão.
      </div>
    );
  }

  const [currentMonth, nextMonth] = await Promise.all([
    getTierSetForMonth(user.tenantId, currentMonthStartISO()),
    getEditableTiersForNextMonth(user.tenantId),
  ]);
  const [nextMonthYear, nextMonthNumber] = nextMonth.monthStartISO.split("-");

  return (
    <div>
      <div className="mb-6">
        <Link href="/colaboradores/ranking-comissao" className="text-sm text-text-muted hover:underline">
          ← Voltar para o Ranking de Comissão
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Configurações de Comissão</h1>
        <p className="text-sm text-text-muted">
          Faixas progressivas por faturamento mensal — o percentual de cada faixa vale só sobre a
          fatia do faturamento que cai dentro dela, nunca sobre o total inteiro.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Faixas deste mês</h2>
        <p className="mb-3 text-xs text-slate-900">
          Já em vigor, não editável — qualquer mudança vale só a partir do próximo mês, pra nunca
          mudar uma comissão que já está sendo calculada.
        </p>
        <div className="space-y-1 text-sm text-slate-900">
          {currentMonth.tiers.map((tier) => (
            <div key={tier.name} className="flex justify-between">
              <span>{tier.name}</span>
              <span>
                {formatBRL(tier.minAmount)} {tier.maxAmount === null ? "sem teto" : `a ${formatBRL(tier.maxAmount)}`} —{" "}
                <strong>{tier.percent}%</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Faixas a partir de {nextMonthNumber}/{nextMonthYear}
      </h2>
      <p className="mb-4 text-sm text-text-muted">
        Crie, edite, desative ou reordene as faixas que valem a partir do próximo mês.
      </p>
      <CommissionTiersForm initialTiers={nextMonth.tiers} />

      <div className="mt-6">
        <Link href="/usuarios/atividades" className="text-sm text-text-muted hover:underline">
          Ver histórico de alterações →
        </Link>
      </div>
    </div>
  );
}
