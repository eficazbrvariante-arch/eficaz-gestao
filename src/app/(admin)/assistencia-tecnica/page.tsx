import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canManageRepairOrders, canManageRepairOrderCostAnytime } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDate, formatISODate, periodRange } from "@/lib/format";
import {
  REPAIR_ORDER_STATUS_BADGE_CLASSES,
  REPAIR_ORDER_STATUS_LABELS,
} from "@/lib/validations/repair-order";
import { StatCard } from "@/components/admin/stat-card";
import { PeriodPicker } from "../relatorios/report-nav";
import { resolvePeriod } from "../relatorios/period";

export default async function AssistenciaTecnicaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string }>;
}) {
  const { q, ...periodParams } = await searchParams;
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a assistência técnica.
      </div>
    );
  }

  const canSeeFinancials = canManageRepairOrderCostAnytime(user.role);
  const period = resolvePeriod(periodParams);
  const { start, end } = periodRange(period.from, period.to);

  const [orders, financialOrders] = await Promise.all([
    prisma.repairOrder.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q
          ? {
              OR: [
                { brand: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { reportedDefects: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { name: true } },
        items: { select: { unitPrice: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    canSeeFinancials
      ? prisma.repairOrder.findMany({
          where: {
            tenantId: user.tenantId,
            status: { not: "CANCELLED" },
            createdAt: { gte: start, lt: end },
          },
          select: {
            discount: true,
            costPrice: true,
            items: { select: { unitPrice: true, quantity: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const financials = financialOrders?.reduce(
    (acc, order) => {
      const gross = order.items.reduce(
        (sum, item) => sum + Number(item.unitPrice) * item.quantity,
        0
      );
      acc.revenue += Math.max(0, gross - Number(order.discount));
      acc.cost += Number(order.costPrice ?? 0);
      return acc;
    },
    { revenue: 0, cost: 0 }
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Assistência Técnica</h1>
          <p className="text-sm text-text-muted">Ordens de serviço de reparo e manutenção.</p>
        </div>
        <Link
          href="/assistencia-tecnica/novo"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nova OS
        </Link>
      </div>

      {canSeeFinancials && financials && (
        <div className="mb-6">
          <p className="mb-2 text-sm text-slate-500">
            Faturamento, gastos e lucro de {formatISODate(period.from)} a{" "}
            {formatISODate(period.to)}.
          </p>
          <PeriodPicker period={period} extraParams={{ q }} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Faturamento" value={formatBRL(financials.revenue)} />
            <StatCard label="Gastos (custo de peças)" value={formatBRL(financials.cost)} />
            <StatCard
              label="Lucro"
              value={formatBRL(financials.revenue - financials.cost)}
              tone={financials.revenue - financials.cost >= 0 ? "positive" : "negative"}
            />
          </div>
        </div>
      )}

      <form className="mb-4 flex gap-2">
        {canSeeFinancials && (
          <>
            <input type="hidden" name="de" value={period.from} />
            <input type="hidden" name="ate" value={period.to} />
          </>
        )}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por cliente, marca, modelo ou defeito..."
          className="w-full min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:w-72 sm:flex-none"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nº OS</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Aparelho</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Entrada</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const total = order.items.reduce(
                (sum, item) => sum + Number(item.unitPrice) * item.quantity,
                0
              );
              return (
                <tr key={order.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">
                    OS{String(order.number).padStart(6, "0")}
                  </td>
                  <td className="px-4 py-3 text-slate-900">{order.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {order.brand} {order.model}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${REPAIR_ORDER_STATUS_BADGE_CLASSES[order.status]}`}
                    >
                      {REPAIR_ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-900">
                    {formatBRL(Math.max(0, total - Number(order.discount)))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/assistencia-tecnica/${order.id}`}
                      className="text-sm text-slate-600 hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma ordem de serviço encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
