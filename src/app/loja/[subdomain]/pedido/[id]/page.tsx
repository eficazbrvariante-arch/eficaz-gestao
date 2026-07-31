import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getStoreBySubdomain,
  storeDisplayName,
} from "@/modules/catalog/tenant-resolver";
import { formatBRL, formatDateTime } from "@/lib/format";
import {
  ORDER_PAYMENT_LABELS,
  ORDER_STATUS_LABELS,
} from "@/modules/orders/order-status";
import {
  buildWhatsappLink,
  buildWhatsappMessage,
  formatAddress,
  type WhatsappOrder,
} from "@/modules/orders/whatsapp-message";

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ subdomain: string; id: string }>;
}) {
  const { subdomain, id } = await params;
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const order = await prisma.order.findFirst({
    where: { id, tenantId: store.id },
    include: { items: true, deliveryZone: true },
  });
  if (!order) notFound();

  const base = `/loja/${store.subdomain}`;
  const storeName = storeDisplayName(store);

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

  const whatsappLink = store.whatsapp
    ? buildWhatsappLink(store.whatsapp, buildWhatsappMessage(whatsappOrder, storeName))
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <h1 className="text-lg font-semibold text-emerald-900">
          Pedido #{order.number} enviado!
        </h1>
        <p className="mt-1 text-sm text-emerald-800">
          Recebemos seu pedido. Agora é só avisar a loja pelo WhatsApp para confirmar.
        </p>
      </div>

      {whatsappLink ? (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 block w-full rounded-md bg-emerald-600 px-5 py-4 text-center text-base font-semibold text-white hover:bg-emerald-700"
        >
          Enviar pedido pelo WhatsApp
        </a>
      ) : (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          Seu pedido foi registrado e a loja já pode vê-lo no sistema. Entre em contato pelos
          canais da loja para confirmar.
        </p>
      )}

      <div className="rounded-xl border border-slate-200 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Pedido #{order.number}</p>
            <p className="text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
          </div>
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>

        <table className="mb-4 w-full text-sm">
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 text-slate-700">
                  {item.quantity}x {item.nameSnapshot}
                </td>
                <td className="py-2 text-right text-slate-900">{formatBRL(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatBRL(order.subtotal)}</span>
          </div>
          {order.fulfillment === "DELIVERY" && (
            <div className="flex justify-between text-slate-600">
              <span>Entrega{order.deliveryZone ? ` (${order.deliveryZone.name})` : ""}</span>
              <span>
                {Number(order.deliveryFee) > 0
                  ? formatBRL(order.deliveryFee)
                  : "a combinar com a loja"}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatBRL(order.total)}</span>
          </div>
        </div>

        <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <p>
            <span className="text-slate-500">Recebimento:</span>{" "}
            {order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada na loja"}
          </p>
          {order.fulfillment === "DELIVERY" && (
            <p>
              <span className="text-slate-500">Endereço:</span> {formatAddress(whatsappOrder)}
            </p>
          )}
          <p>
            <span className="text-slate-500">Pagamento:</span>{" "}
            {ORDER_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
          {order.notes && (
            <p>
              <span className="text-slate-500">Observações:</span> {order.notes}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href={`${base}/produtos`} className="text-sm text-slate-600 hover:underline">
          Continuar comprando
        </Link>
      </div>
    </div>
  );
}
