import Link from "next/link";
import type { Viewport } from "next";
import { requireTenant } from "@/lib/session";
import { canApplyDiscount, canDiscountFreely, canManageFiado, canSell } from "@/lib/permissions";
import { getOpenCashRegister } from "@/modules/cash/cash-service";
import { getBirthdayAlerts } from "@/modules/customers/birthday-service";
import { formatDateTime, todayISO, periodRange, currentMonthStartISO } from "@/lib/format";
import { getCommissionRanking } from "@/modules/employees/commission-service";
import { getSellerTierProgressByUsers } from "@/modules/employees/commission-tier-service";
import { RankingComissaoMatrix, type RankingComissaoRow } from "../colaboradores/ranking-comissao/ranking-comissao-matrix";
import { PdvScreen } from "./pdv-screen";

// Trava o zoom só nesta rota: o PDV é operado por toque rápido e um pinch
// acidental durante uma venda não pode distorcer o layout dos botões.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function PdvPage() {
  const { user, tenant } = await requireTenant();

  if (!canSell(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para realizar vendas no PDV.
      </div>
    );
  }

  const register = await getOpenCashRegister(user.tenantId);

  if (!register) {
    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold text-foreground">PDV</h1>
        <p className="mb-6 text-sm text-text-muted">
          É necessário abrir o caixa antes de registrar vendas.
        </p>
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="mb-4 text-sm text-amber-900">
            Nenhum caixa aberto no momento. Abra o caixa informando o valor inicial da gaveta.
          </p>
          <Link
            href="/caixa"
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Abrir caixa
          </Link>
        </div>
      </div>
    );
  }

  const birthdayAlerts = await getBirthdayAlerts(user.tenantId);

  // Permanente por padrão — só pula a consulta quando o Admin desligou o
  // botão em "Ranking de Comissão" (interruptor temporário, ex.: pra não
  // gerar expectativa/ansiedade durante o dia). Período fixo do dia 1 do
  // mês até hoje: é uma vitrine ao vivo do mês corrente, diferente do
  // painel administrativo (que olha qualquer intervalo escolhido). Nunca
  // rotula como "hoje" — o valor acumulado do mês é bem maior que o de um
  // dia só, e rotular errado passa a impressão de que o dia teve um volume
  // fora do normal.
  let pdvRanking: RankingComissaoRow[] = [];
  const monthStart = currentMonthStartISO();
  const today = todayISO();
  if (tenant.pdvRankingEnabled) {
    const { start, end } = periodRange(monthStart, today);
    const ranking = await getCommissionRanking(user.tenantId, { start, end });
    const tierProgressByUser = await getSellerTierProgressByUsers(
      user.tenantId,
      ranking.map((row) => row.userId),
      monthStart
    );
    pdvRanking = ranking.map((row) => ({ ...row, tierProgress: tierProgressByUser.get(row.userId) ?? null }));
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">PDV</h1>
          <p className="text-sm text-text-muted">
            Caixa aberto por {register.openedBy.name} em {formatDateTime(register.openedAt)}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/vendas"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Vendas
          </Link>
          <Link
            href="/caixa"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Caixa
          </Link>
        </div>
      </div>

      {birthdayAlerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {birthdayAlerts.map((alert) => (
            <p key={alert.id}>
              {alert.when === "today"
                ? `Hoje é aniversário de ${alert.name}!`
                : `Amanhã é aniversário de ${alert.name}.`}
            </p>
          ))}
        </div>
      )}

      <PdvScreen
        canDiscount={canApplyDiscount(user.role)}
        canDiscountFreely={canDiscountFreely(user.role)}
        canFiado={canManageFiado(user.role)}
        autoPrintReceipt={tenant.autoPrintReceipt}
      />

      {/* Rodapé, nunca a área operacional do topo — permanente por padrão,
          some só se o Admin desligar o botão em "Ranking de Comissão". */}
      {tenant.pdvRankingEnabled && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Ranking de Comissão de venda do mês</h2>
          <RankingComissaoMatrix rows={pdvRanking} period={{ from: monthStart, to: today }} />
        </div>
      )}
    </div>
  );
}
