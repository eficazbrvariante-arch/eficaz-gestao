import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Rótulos e regras de fluxo do pedido.
 *
 * Este módulo é deliberadamente **livre de acesso ao banco**: componentes de
 * cliente precisam desses rótulos, e importar o `order-service` (que carrega o
 * Prisma) arrastaria módulos do Node para o bundle do navegador.
 */

/** Ordem em que o pedido avança. CANCELLED é alcançável de qualquer etapa aberta. */
export const ORDER_FLOW: OrderStatus[] = [
  "NEW",
  "CONFIRMED",
  "PREPARING",
  "SHIPPED",
  "COMPLETED",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Novo",
  CONFIRMED: "Confirmado",
  PREPARING: "Em separação",
  SHIPPED: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const ORDER_PAYMENT_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  TO_ARRANGE: "A combinar",
};

/** Próxima etapa do fluxo, ou `null` se o pedido já terminou. */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  if (status === "CANCELLED" || status === "COMPLETED") return null;
  const index = ORDER_FLOW.indexOf(status);
  return index >= 0 && index < ORDER_FLOW.length - 1 ? ORDER_FLOW[index + 1] : null;
}
