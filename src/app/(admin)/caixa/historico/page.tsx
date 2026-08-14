import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageCashRegister, canViewAllSales } from "@/lib/permissions";
import { formatBRL, formatDateTime } from "@/lib/format";

export default async function HistoricoCaixaPage() {
  const user = await requireUser();
  if (!canManageCashRegister(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o histórico de caixa.
      </div>
    );
  }

  // Vendedor só vê o caixa que estiver aberto agora — não necessariamente o
  // que ele mesmo abriu (o caixa é um só, físico, pode passar de vendedor
  // pra vendedor no mesmo turno sem fechar) — e só enquanto durar aberto:
  // some da lista assim que fecha. Admin/Gerente (canViewAllSales)
  // continuam vendo o histórico completo, de todo mundo.
  const seeAll = canViewAllSales(user.role);
  const registers = await prisma.cashRegister.findMany({
    where: seeAll
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, status: "OPEN" },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      _count: { select: { sales: true } },
    },
    orderBy: { openedAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="mb-6">
        <Link href="/caixa" className="text-sm text-slate-500 hover:underline">
          ← Voltar para o caixa
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Histórico de caixas</h1>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Abertura</th>
              <th className="px-4 py-3 font-medium">Fechamento</th>
              <th className="px-4 py-3 font-medium">Vendas</th>
              <th className="px-4 py-3 font-medium">Esperado</th>
              <th className="px-4 py-3 font-medium">Contado</th>
              <th className="px-4 py-3 font-medium">Diferença</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {registers.map((r) => {
              const difference =
                r.countedAmount !== null && r.expectedAmount !== null
                  ? Number(r.countedAmount) - Number(r.expectedAmount)
                  : null;
              return (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{formatDateTime(r.openedAt)}</div>
                    <div className="text-xs text-slate-400">
                      {r.openedBy.name} · {formatBRL(r.openingAmount)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.closedAt ? (
                      <>
                        <div className="text-slate-900">{formatDateTime(r.closedAt)}</div>
                        <div className="text-xs text-slate-400">{r.closedBy?.name ?? "-"}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r._count.sales}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.expectedAmount !== null ? formatBRL(r.expectedAmount) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {r.countedAmount !== null ? formatBRL(r.countedAmount) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {difference === null ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      <span
                        className={
                          Math.abs(difference) < 0.005
                            ? "text-slate-600"
                            : difference > 0
                              ? "text-emerald-700"
                              : "text-red-600"
                        }
                      >
                        {difference > 0 ? "+" : ""}
                        {formatBRL(difference)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.status === "OPEN"
                          ? "rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                          : "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      }
                    >
                      {r.status === "OPEN" ? "Aberto" : "Fechado"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/vendas?cashRegisterId=${r.id}`}
                      className="text-sm text-slate-600 hover:underline"
                    >
                      Ver vendas
                    </Link>
                  </td>
                </tr>
              );
            })}
            {registers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  {seeAll ? "Nenhum caixa registrado ainda." : "Nenhum caixa aberto no momento."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
