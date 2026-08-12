import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canViewReports } from "@/lib/permissions";
import { formatBRL, formatDateTime, formatISODate, periodRange } from "@/lib/format";
import { getCashRegisterReport, getStoreCreditUsage } from "@/modules/reports/report-service";
import { StatCard } from "@/components/admin/stat-card";
import { ReportTabs, PeriodPicker, ExportButton } from "../report-nav";
import { resolvePeriod } from "../period";

const MOVEMENT_LABELS: Record<string, string> = {
  WITHDRAWAL: "Sangria",
  SUPPLY: "Suprimento",
};

export default async function RelatorioCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireUser();
  if (!canViewReports(user.role)) redirect("/dashboard");

  const period = resolvePeriod(await searchParams);
  const { start, end } = periodRange(period.from, period.to);

  const [report, movements, storeCreditUsage] = await Promise.all([
    getCashRegisterReport(user.tenantId, period),
    prisma.cashMovement.findMany({
      where: { tenantId: user.tenantId, createdAt: { gte: start, lt: end } },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getStoreCreditUsage(user.tenantId, period),
  ]);
  const storeCreditTotal = storeCreditUsage.reduce((sum, row) => sum + row.amount, 0);

  // Diferenças de caixa: quanto sobrou ou faltou na conferência do fechamento.
  const closed = report.registers.filter((r) => r.difference !== null);
  const totalDifference = closed.reduce((sum, r) => sum + (r.difference ?? 0), 0);
  const withDivergence = closed.filter((r) => Math.abs(r.difference ?? 0) >= 0.005);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Relatórios de caixa</h1>
          <p className="text-sm text-slate-500">
            {formatISODate(period.from)} a {formatISODate(period.to)}
          </p>
        </div>
        <ExportButton report="caixa" period={period} />
      </div>

      <ReportTabs period={period} />
      <PeriodPicker period={period} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Caixas abertos no período" value={String(report.registers.length)} />
        <StatCard label="Sangrias" value={formatBRL(report.withdrawals)} />
        <StatCard label="Suprimentos" value={formatBRL(report.supplies)} />
        <StatCard
          label="Diferença acumulada"
          value={formatBRL(totalDifference)}
          hint={
            withDivergence.length > 0
              ? `${withDivergence.length} fechamento(s) com divergência`
              : "sem divergências"
          }
          tone={
            Math.abs(totalDifference) < 0.005
              ? "default"
              : totalDifference > 0
                ? "positive"
                : "negative"
          }
        />
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
          Fechamentos de caixa
        </div>
        {report.registers.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">
            Nenhum caixa aberto neste período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Abertura</th>
                  <th className="px-3 py-2 font-medium">Fechamento</th>
                  <th className="px-3 py-2 text-right font-medium">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium">Esperado</th>
                  <th className="px-3 py-2 text-right font-medium">Contado</th>
                  <th className="px-5 py-2 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {report.registers.map((register) => (
                  <tr key={register.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2">
                      <div className="text-slate-900">{formatDateTime(register.openedAt)}</div>
                      <div className="text-xs text-slate-400">
                        {register.openedBy} · {formatBRL(register.openingAmount)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {register.closedAt ? (
                        <>
                          <div className="text-slate-900">
                            {formatDateTime(register.closedAt)}
                          </div>
                          <div className="text-xs text-slate-400">{register.closedBy ?? "-"}</div>
                        </>
                      ) : (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          Aberto
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {register.salesCount}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {register.expectedAmount === null
                        ? "-"
                        : formatBRL(register.expectedAmount)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900">
                      {register.countedAmount === null
                        ? "-"
                        : formatBRL(register.countedAmount)}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {register.difference === null ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={
                            Math.abs(register.difference) < 0.005
                              ? "text-slate-600"
                              : register.difference > 0
                                ? "text-emerald-700"
                                : "text-red-600"
                          }
                        >
                          {register.difference > 0 ? "+" : ""}
                          {formatBRL(register.difference)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
          Sangrias e suprimentos
        </div>
        {movements.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">
            Nenhuma movimentação neste período.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Motivo</th>
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-5 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2 text-slate-500">
                    {formatDateTime(movement.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-slate-900">
                    {MOVEMENT_LABELS[movement.type] ?? movement.type}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{movement.description ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{movement.user.name}</td>
                  <td
                    className={
                      movement.type === "WITHDRAWAL"
                        ? "px-5 py-2 text-right text-red-600"
                        : "px-5 py-2 text-right text-emerald-700"
                    }
                  >
                    {movement.type === "WITHDRAWAL" ? "-" : "+"}
                    {formatBRL(movement.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {storeCreditUsage.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="border-b border-amber-200 px-5 py-3 text-sm font-semibold text-amber-900">
            Uso de crédito de loja no período — {formatBRL(storeCreditTotal)} não são dinheiro novo
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-amber-200 text-left text-amber-800">
              <tr>
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Venda</th>
                <th className="px-5 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {storeCreditUsage.map((row) => (
                <tr key={row.id} className="border-b border-amber-100 last:border-0">
                  <td className="px-5 py-2 text-amber-900">{formatDateTime(row.createdAt)}</td>
                  <td className="px-3 py-2 text-amber-900">{row.customerName}</td>
                  <td className="px-3 py-2 text-amber-900">
                    <Link href={`/vendas/${row.saleId}`} className="hover:underline">
                      #{row.saleNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-2 text-right font-medium text-amber-900">
                    {formatBRL(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
