import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageEmployeeLedger } from "@/lib/permissions";
import { formatBRL, formatDateTime, formatISODate, periodRange } from "@/lib/format";
import { getSellerCommissionHistory } from "@/modules/employees/commission-service";
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
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar esta página.
      </div>
    );
  }

  const period = resolvePeriod(await searchParams);
  const { start, end } = periodRange(period.from, period.to);
  const history = await getSellerCommissionHistory(user.tenantId, userId, { start, end }).catch(() => null);
  if (!history) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/colaboradores" className="text-sm text-text-muted hover:underline">
          ← Voltar para Colaboradores
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          Comissão de venda — {history.sellerName}
        </h1>
        <p className="text-sm text-text-muted">
          {formatISODate(period.from)} a {formatISODate(period.to)} · {history.sales.length} venda(s)
          concluída(s) · Total de comissão:{" "}
          <span className="font-semibold text-emerald-700">{formatBRL(history.totalCommission)}</span>
        </p>
      </div>

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
