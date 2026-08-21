import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime, formatISODate, periodRange, todayISO } from "@/lib/format";
import { canCancelSale, canSell, canViewAllSales } from "@/lib/permissions";
import { PeriodPicker } from "../relatorios/report-nav";

const STATUS_FILTERS = [
  { label: "Todas", value: "" },
  { label: "Concluídas", value: "COMPLETED" },
  { label: "Canceladas", value: "CANCELLED" },
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Diferente do padrão dos Relatórios (mês atual) — Vendas começa só no dia de hoje. */
function resolveSalesPeriod(searchParams: { de?: string; ate?: string }) {
  const today = todayISO();
  const from = ISO_DATE.test(searchParams.de ?? "") ? searchParams.de! : today;
  const to = ISO_DATE.test(searchParams.ate ?? "") ? searchParams.ate! : today;
  return from > to ? { from: to, to: from } : { from, to };
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cashRegisterId?: string; de?: string; ate?: string }>;
}) {
  const { status, cashRegisterId, de, ate } = await searchParams;
  const user = await requireUser();

  const seeAll = canViewAllSales(user.role);
  if (!seeAll && !canSell(user.role)) redirect("/vendas/buscar");

  // Vendedor só vê as vendas do caixa que estiver aberto agora — não
  // necessariamente o que ele mesmo abriu (o caixa é um só, físico, e pode
  // passar de um vendedor pro outro no mesmo turno sem fechar) — e só
  // enquanto durar aberto: some da lista assim que fecha. Admin/Gerente
  // (seeAll) podem entrar num caixa específico, aberto ou já fechado, a
  // partir do Histórico de caixas — `cashRegisterId` na URL, nunca
  // escolhido por Vendedor (que não tem esse link disponível).
  let filterCashRegisterId: string | null = null;
  if (!seeAll) {
    const register = await prisma.cashRegister.findFirst({
      where: { tenantId: user.tenantId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    });
    if (!register) {
      return (
        <div>
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Vendas</h1>
          <p className="mb-6 text-sm text-slate-500">
            Nenhum caixa aberto no momento — as vendas aparecem aqui a partir da abertura do
            caixa, e somem quando ele for fechado.
          </p>
          <Link
            href="/caixa"
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ir para o Caixa
          </Link>
        </div>
      );
    }
    filterCashRegisterId = register.id;
  } else if (cashRegisterId) {
    filterCashRegisterId = cashRegisterId;
  }

  // Só filtra por data na navegação geral — quem entra num caixa específico
  // (Admin/Gerente vindo do Histórico de caixas) quer ver tudo daquele caixa,
  // não só o dia de hoje.
  const isSpecificRegisterView = seeAll && Boolean(cashRegisterId);
  const period = resolveSalesPeriod({ de, ate });
  const { start, end } = periodRange(period.from, period.to);

  const [sales, viewedRegister] = await Promise.all([
    prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filterCashRegisterId ? { cashRegisterId: filterCashRegisterId } : {}),
        ...(status === "COMPLETED" || status === "CANCELLED" ? { status } : {}),
        ...(isSpecificRegisterView ? {} : { createdAt: { gte: start, lt: end } }),
      },
      include: {
        customer: { select: { name: true } },
        seller: { select: { name: true } },
        payments: true,
        _count: { select: { items: true } },
      },
      orderBy: { number: "desc" },
      take: 100,
    }),
    seeAll && cashRegisterId
      ? prisma.cashRegister.findFirst({
          where: { id: cashRegisterId, tenantId: user.tenantId },
          include: { openedBy: { select: { name: true } }, closedBy: { select: { name: true } } },
        })
      : null,
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Vendas</h1>
          <p className="text-sm text-slate-500">
            {isSpecificRegisterView
              ? "Vendas deste caixa."
              : `${!seeAll ? "Vendas do caixa aberto" : "Histórico de vendas"} · ${formatISODate(period.from)}${period.from !== period.to ? ` a ${formatISODate(period.to)}` : ""}`}
          </p>
        </div>
        <Link
          href="/pdv"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nova venda
        </Link>
      </div>

      {viewedRegister && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-600">
            Caixa aberto por <strong>{viewedRegister.openedBy.name}</strong> em{" "}
            {formatDateTime(viewedRegister.openedAt)}
            {viewedRegister.closedAt && (
              <>
                {" "}
                · fechado por <strong>{viewedRegister.closedBy?.name ?? "-"}</strong> em{" "}
                {formatDateTime(viewedRegister.closedAt)}
              </>
            )}
          </span>
          <Link href="/vendas" className="font-medium text-slate-700 hover:underline">
            ← Ver todas as vendas
          </Link>
        </div>
      )}

      {!isSpecificRegisterView && (
        <PeriodPicker period={period} extraParams={{ status }} />
      )}

      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((filter) => {
          const isActive = (status ?? "") === filter.value;
          const query = new URLSearchParams();
          if (filter.value) query.set("status", filter.value);
          if (viewedRegister) query.set("cashRegisterId", viewedRegister.id);
          if (!isSpecificRegisterView) {
            query.set("de", period.from);
            query.set("ate", period.to);
          }
          const queryString = query.toString();
          return (
            <Link
              key={filter.value}
              href={queryString ? `/vendas?${queryString}` : "/vendas"}
              className={
                isActive
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              }
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Venda</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Vendedor</th>
              <th className="px-4 py-3 font-medium">Itens</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">#{sale.number}</td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(sale.createdAt)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {sale.customer?.name ?? "Consumidor final"}
                </td>
                <td className="px-4 py-3 text-slate-500">{sale.seller.name}</td>
                <td className="px-4 py-3 text-slate-500">{sale._count.items}</td>
                <td className="px-4 py-3 text-slate-900">
                  {formatBRL(sale.total)}
                  {Number(sale.discount) > 0 && (
                    <div className="text-xs text-slate-400">
                      desc. {formatBRL(sale.discount)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      sale.status === "CANCELLED"
                        ? "rounded bg-red-50 px-2 py-0.5 text-xs text-red-700"
                        : "rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                    }
                  >
                    {sale.status === "CANCELLED" ? "Cancelada" : "Concluída"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/vendas/${sale.id}`}
                      className="text-sm text-slate-600 hover:underline"
                    >
                      Comprovante
                    </Link>
                    {sale.status === "COMPLETED" && canCancelSale(user.role) && (
                      <Link
                        href={`/vendas/${sale.id}?cancelar=1`}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Cancelar
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  {isSpecificRegisterView
                    ? "Nenhuma venda registrada ainda."
                    : "Nenhuma venda encontrada nesse período."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
