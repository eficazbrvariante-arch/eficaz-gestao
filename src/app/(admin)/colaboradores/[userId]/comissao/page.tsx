import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageEmployeeLedger } from "@/lib/permissions";
import { formatBRL, formatDateTime, formatISODate, periodRange, currentMonthStartISO } from "@/lib/format";
import { getSellerCommissionHistory } from "@/modules/employees/commission-service";
import { getSellerTierProgressByUsers } from "@/modules/employees/commission-tier-service";
import { TierBadge, TierProgressBar, TierIndicators } from "@/components/employees/tier-progress-ui";
import { resolvePeriod } from "../../../relatorios/period";
import { PeriodPicker } from "../../../relatorios/report-nav";

export default async function ComissaoColaboradorPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const { userId } = await params;
  const user = await requireUser();
  // Admin/Gerente veem qualquer colaborador; o próprio vendedor só vê a si
  // mesmo — nunca a comissão de um colega (ver pedido: "confirma pra todos
  // os vendedores que a mudança de faixa está avisada").
  const canView = canManageEmployeeLedger(user.role) || user.id === userId;
  if (!canView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar esta página.
      </div>
    );
  }

  const period = resolvePeriod(await searchParams);
  const { start, end } = periodRange(period.from, period.to);
  const [history, tierProgress] = await Promise.all([
    getSellerCommissionHistory(user.tenantId, userId, { start, end }).catch(() => null),
    getSellerTierProgressByUsers(user.tenantId, [userId], currentMonthStartISO()).then((m) => m.get(userId) ?? null),
  ]);
  if (!history) notFound();

  return (
    <div>
      <div className="mb-6">
        {/* Vendedor não tem acesso à lista de Colaboradores, então esse link
            só faz sentido pra quem gerencia (Admin/Gerente). */}
        {canManageEmployeeLedger(user.role) && (
          <Link href="/colaboradores" className="text-sm text-text-muted hover:underline">
            ← Voltar para Colaboradores
          </Link>
        )}
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          Comissão de venda — {history.sellerName}
        </h1>
        <p className="text-sm text-text-muted">
          {formatISODate(period.from)} a {formatISODate(period.to)} · {history.sales.length} venda(s)
          concluída(s) · Comissão do período selecionado:{" "}
          <span className="font-semibold text-emerald-700">{formatBRL(history.totalCommission)}</span>
        </p>
      </div>

      {tierProgress && (
        <div className="mb-6 rounded-xl border border-[#0f3d22] bg-[#020805] p-5 shadow-[0_0_40px_-15px_rgba(57,255,136,0.35)]">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-xs tracking-widest text-[#39ff88]/70">&gt; sua_faixa --mes=corrente</p>
            <TierBadge tierProgress={tierProgress} />
          </div>
          <TierProgressBar tierProgress={tierProgress} />
          <div className="mt-3">
            <TierIndicators tierProgress={tierProgress} />
          </div>
          <p className="mt-3 font-mono text-[11px] text-[#39ff88]/40">
            Sua faixa é sempre do mês corrente — o histórico de vendas abaixo é do período que você
            escolher no filtro, por isso os dois números podem ser diferentes.
          </p>
        </div>
      )}

      <PeriodPicker period={period} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Venda</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium text-right">Total da venda</th>
              <th className="px-4 py-3 font-medium text-right">Comissão</th>
            </tr>
          </thead>
          <tbody>
            {history.sales.map((sale) => (
              <tr key={sale.saleId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/vendas/${sale.saleId}`} className="font-medium text-slate-900 hover:underline">
                    #{sale.number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(sale.createdAt)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{formatBRL(sale.total)}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-700">
                  {formatBRL(sale.commission)}
                </td>
              </tr>
            ))}
            {history.sales.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Nenhuma venda concluída ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
