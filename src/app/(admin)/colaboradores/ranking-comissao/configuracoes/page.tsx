import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canEditCommission } from "@/lib/permissions";
import { currentMonthStartISO, formatBRL } from "@/lib/format";
import {
  getTierSetForMonth,
  getEditableTiersForMonth,
  getEditableTiersForNextMonth,
} from "@/modules/employees/commission-tier-service";
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

  const [currentMonth, currentMonthEditable, nextMonth] = await Promise.all([
    getTierSetForMonth(user.tenantId, currentMonthStartISO()),
    getEditableTiersForMonth(user.tenantId, currentMonthStartISO()),
    getEditableTiersForNextMonth(user.tenantId),
  ]);
  // Mês corrente já tem um conjunto próprio configurado (mostra só leitura)
  // ou ainda está no padrão implícito (permite configurar uma única vez,
  // valendo imediatamente — ver `saveTiersForMonth`).
  const currentMonthAlreadySet = currentMonth.tierSetId !== null;
  const [currentMonthYear, currentMonthNumber] = currentMonthEditable.monthStartISO.split("-");
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

      {currentMonthAlreadySet ? (
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
      ) : (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Configurar faixas deste mês ({currentMonthNumber}/{currentMonthYear})
          </h2>
          <p className="mb-4 text-sm text-text-muted">
            Ainda não configurado (usando a alíquota padrão do tenant). Essa é a configuração
            inicial: só pode ser feita uma vez e vale imediatamente para o mês corrente — depois de
            salva, só o próximo mês fica editável.
          </p>
          <CommissionTiersForm initialTiers={currentMonthEditable.tiers} target="current" />
        </div>
      )}

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
