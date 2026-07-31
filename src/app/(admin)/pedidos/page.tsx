import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/modules/orders/order-status";
import type { OrderStatus } from "@/generated/prisma/enums";

const STATUS_STYLES: Record<OrderStatus, string> = {
  NEW: "bg-blue-50 text-blue-700",
  CONFIRMED: "bg-indigo-50 text-indigo-700",
  PREPARING: "bg-amber-50 text-amber-700",
  SHIPPED: "bg-purple-50 text-purple-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const FILTERS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Novos", value: "NEW" },
  { label: "Confirmados", value: "CONFIRMED" },
  { label: "Em separação", value: "PREPARING" },
  { label: "Saiu para entrega", value: "SHIPPED" },
  { label: "Concluídos", value: "COMPLETED" },
  { label: "Cancelados", value: "CANCELLED" },
];

function isOrderStatus(value: string | undefined): value is OrderStatus {
  return !!value && value in ORDER_STATUS_LABELS;
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireUser();

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId: user.tenantId,
        ...(isOrderStatus(status) ? { status } : {}),
      },
      include: { _count: { select: { items: true } } },
      orderBy: { number: "desc" },
      take: 100,
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { tenantId: user.tenantId },
      _count: true,
    }),
  ]);

  const countByStatus = new Map(counts.map((c) => [c.status, c._count]));
  const newCount = countByStatus.get("NEW") ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Pedidos online</h1>
        <p className="text-sm text-slate-500">
          Pedidos recebidos pelo catálogo.
          {newCount > 0 && (
            <span className="ml-1 font-medium text-blue-700">
              {newCount} aguardando confirmação.
            </span>
          )}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const isActive = (status ?? "") === filter.value;
          const count = filter.value
            ? (countByStatus.get(filter.value as OrderStatus) ?? 0)
            : orders.length;
          return (
            <Link
              key={filter.value}
              href={filter.value ? `/pedidos?status=${filter.value}` : "/pedidos"}
              className={
                isActive
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              }
            >
              {filter.label}
              {filter.value && count > 0 && (
                <span className={isActive ? "ml-1 text-slate-300" : "ml-1 text-slate-400"}>
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Recebimento</th>
              <th className="px-4 py-3 font-medium">Itens</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">#{order.number}</td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(order.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-900">{order.customerName}</div>
                  <div className="text-xs text-slate-400">{order.customerPhone}</div>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}
                </td>
                <td className="px-4 py-3 text-slate-500">{order._count.items}</td>
                <td className="px-4 py-3 text-slate-900">{formatBRL(order.total)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[order.status]}`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/pedidos/${order.id}`}
                    className="text-sm text-slate-600 hover:underline"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Nenhum pedido {status ? "com este status" : "recebido ainda"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
