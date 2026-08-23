import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { canCancelSale } from "@/lib/permissions";
import {
  ORDER_PAYMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_FLOW,
  nextOrderStatus,
} from "@/modules/orders/order-status";
import {
  buildWhatsappLink,
  buildWhatsappMessage,
  formatAddress,
  type WhatsappOrder,
} from "@/modules/orders/whatsapp-message";
import { OrderActions } from "./order-actions";

export default async function PedidoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const [order, tenant] = await Promise.all([
    prisma.order.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: true, deliveryZone: true, customer: true },
    }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { name: true, tradeName: true, stockPolicy: true },
    }),
  ]);
  if (!order) notFound();

  const whatsappOrder: WhatsappOrder = {
    number: order.number,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    changeFor: order.changeFor === null ? null : Number(order.changeFor),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    total: Number(order.total),
    notes: order.notes,
    addressStreet: order.addressStreet,
    addressNumber: order.addressNumber,
    addressComplement: order.addressComplement,
    addressNeighborhood: order.addressNeighborhood,
    addressCity: order.addressCity,
    addressState: order.addressState,
    addressZip: order.addressZip,
    items: order.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
  };

  // Conversa com o cliente, já com o resumo do pedido pronto para enviar.
  const message = buildWhatsappMessage(
    whatsappOrder,
    tenant.tradeName?.trim() || tenant.name
  );
  const whatsappLink = buildWhatsappLink(order.customerPhone, message);

  const isOpen = order.status !== "COMPLETED" && order.status !== "CANCELLED";
  const currentStep = ORDER_FLOW.indexOf(order.status);

  return (
    <div>
      <div className="mb-6">
        <Link href="/pedidos" className="text-sm text-text-muted hover:underline">
          ← Voltar para pedidos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">Pedido #{order.number}</h1>
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          {order.origin === "WHATSAPP" && (
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              Via WhatsApp — combine entrega e pagamento na conversa
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">{formatDateTime(order.createdAt)}</p>
      </div>

      {/* Linha do tempo */}
      {order.status !== "CANCELLED" && (
        <div className="mb-6 flex flex-wrap gap-2 text-xs">
          {ORDER_FLOW.map((step, index) => {
            const done = currentStep >= index;
            return (
              <span
                key={step}
                className={
                  done
                    ? "rounded-full bg-slate-900 px-3 py-1 font-medium text-white"
                    : "rounded-full border border-slate-300 px-3 py-1 text-slate-500"
                }
              >
                {ORDER_STATUS_LABELS[step]}
              </span>
            );
          })}
        </div>
      )}

      {order.status === "CANCELLED" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Pedido cancelado</p>
          <p className="text-sm text-red-800">{order.cancelReason}</p>
          {order.cancelledAt && (
            <p className="mt-1 text-xs text-red-600">{formatDateTime(order.cancelledAt)}</p>
          )}
        </div>
      )}

      <div className="mb-6">
        <OrderActions
          orderId={order.id}
          nextStatus={nextOrderStatus(order.status)}
          canCancel={isOpen && canCancelSale(user.role)}
          whatsappLink={whatsappLink}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Itens do pedido
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Produto</th>
                <th className="px-4 py-2 text-center font-medium">Qtd</th>
                <th className="px-4 py-2 text-right font-medium">Unit.</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{item.nameSnapshot}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {formatBRL(item.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900">
                    {formatBRL(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-slate-200 px-4 py-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatBRL(order.subtotal)}</span>
            </div>
            {order.fulfillment === "DELIVERY" && (
              <div className="flex justify-between text-slate-600">
                <span>
                  Entrega{order.deliveryZone ? ` (${order.deliveryZone.name})` : ""}
                </span>
                <span>
                  {Number(order.deliveryFee) > 0
                    ? formatBRL(order.deliveryFee)
                    : "a combinar"}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatBRL(order.total)}</span>
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            {order.stockDeductedAt
              ? `Estoque já baixado em ${formatDateTime(order.stockDeductedAt)}.`
              : tenant.stockPolicy === "RESERVE"
                ? "O estoque será baixado quando o pedido for concluído."
                : "O estoque ainda não foi baixado."}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Cliente</h2>
            <div className="space-y-1 text-sm text-slate-600">
              <p className="font-medium text-slate-900">{order.customerName}</p>
              <p>{order.customerPhone}</p>
              {order.customerEmail && <p>{order.customerEmail}</p>}
              {order.customer && (
                <Link
                  href={`/clientes/${order.customer.id}`}
                  className="inline-block text-xs text-slate-500 hover:underline"
                >
                  Ver ficha do cliente
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Entrega</h2>
            <div className="space-y-1 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                {order.fulfillment === "DELIVERY"
                  ? "Entrega"
                  : order.fulfillment === "PICKUP"
                    ? "Retirada na loja"
                    : "A combinar com o cliente"}
              </p>
              {order.fulfillment === "DELIVERY" && <p>{formatAddress(whatsappOrder)}</p>}
              {order.deliveryZone?.estimate && (
                <p className="text-xs text-slate-400">Prazo: {order.deliveryZone.estimate}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Pagamento</h2>
            <div className="space-y-1 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                {order.paymentMethod
                  ? (ORDER_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod)
                  : "A combinar com o cliente"}
              </p>
              {order.changeFor && (
                <p>
                  Troco para {formatBRL(order.changeFor)} (levar{" "}
                  {formatBRL(Number(order.changeFor) - Number(order.total))})
                </p>
              )}
            </div>
          </div>

          {order.notes && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Observações</h2>
              <p className="whitespace-pre-line text-sm text-slate-600">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
