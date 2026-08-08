import { formatBRL } from "@/lib/format";
import { ORDER_PAYMENT_LABELS } from "./order-status";

export { buildWhatsappLink } from "@/lib/whatsapp";

export type WhatsappOrder = {
  number: number;
  customerName: string;
  customerPhone: string;
  /** `null` só em pedidos vindos do CTA "Comprar pelo WhatsApp" (`origin: WHATSAPP`) — ainda não combinado com o cliente. */
  fulfillment: "DELIVERY" | "PICKUP" | null;
  /** `null` pela mesma razão de `fulfillment`. */
  paymentMethod: string | null;
  changeFor: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  items: { nameSnapshot: string; quantity: number; unitPrice: number; total: number }[];
};

/** Endereço em uma linha, ignorando os campos não preenchidos. */
export function formatAddress(order: WhatsappOrder) {
  const line1 = [order.addressStreet, order.addressNumber].filter(Boolean).join(", ");
  const parts = [
    line1,
    order.addressComplement,
    order.addressNeighborhood,
    [order.addressCity, order.addressState].filter(Boolean).join("/"),
    order.addressZip ? `CEP ${order.addressZip}` : null,
  ].filter((part) => part && part.length > 0);
  return parts.join(" - ");
}

/**
 * Monta a mensagem do pedido para o WhatsApp da loja.
 *
 * Texto puro com quebras de linha — o WhatsApp não aceita HTML, e o `*` marca
 * negrito no aplicativo.
 */
export function buildWhatsappMessage(order: WhatsappOrder, storeName: string) {
  const lines: string[] = [];

  lines.push(`*Novo pedido #${order.number}* - ${storeName}`);
  lines.push("");
  lines.push(`*Cliente:* ${order.customerName}`);
  lines.push(`*Telefone:* ${order.customerPhone}`);
  lines.push("");

  lines.push("*Itens:*");
  for (const item of order.items) {
    lines.push(
      `• ${item.quantity}x ${item.nameSnapshot} - ${formatBRL(item.unitPrice)} = ${formatBRL(item.total)}`
    );
  }
  lines.push("");

  lines.push(`*Subtotal:* ${formatBRL(order.subtotal)}`);
  if (order.deliveryFee > 0) {
    lines.push(`*Taxa de entrega:* ${formatBRL(order.deliveryFee)}`);
  }
  lines.push(`*Total:* ${formatBRL(order.total)}`);
  lines.push("");

  if (order.fulfillment === "DELIVERY") {
    lines.push("*Entrega no endereço:*");
    lines.push(formatAddress(order));
  } else if (order.fulfillment === "PICKUP") {
    lines.push("*Retirada na loja*");
  } else {
    lines.push("*Entrega/retirada:* a combinar");
  }
  lines.push("");

  const paymentLabel = order.paymentMethod
    ? (ORDER_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod)
    : "a combinar";
  lines.push(`*Pagamento:* ${paymentLabel}`);
  if (order.paymentMethod === "CASH" && order.changeFor) {
    const change = order.changeFor - order.total;
    lines.push(
      `*Troco para:* ${formatBRL(order.changeFor)}` +
        (change > 0 ? ` (levar ${formatBRL(change)} de troco)` : "")
    );
  }

  if (order.notes) {
    lines.push("");
    lines.push(`*Observações:* ${order.notes}`);
  }

  return lines.join("\n");
}
