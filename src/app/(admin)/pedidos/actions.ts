"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canSell } from "@/lib/permissions";
import { updateOrderStatus } from "@/modules/orders/order-service";
import { ORDER_STATUS_LABELS } from "@/modules/orders/order-status";
import { recordAudit } from "@/modules/audit/audit-service";
import { orderStatusSchema, type OrderStatusInput } from "@/lib/validations/order";

export async function updateOrderStatusAction(orderId: string, input: OrderStatusInput) {
  const user = await requireUser();
  if (!canSell(user.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar pedidos." };
  }

  const parsed = orderStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await updateOrderStatus(
    user.tenantId,
    orderId,
    user.id,
    parsed.data.status,
    parsed.data.reason
  );
  if (!result.ok) return { error: result.error };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { number: true },
  });
  const isCancel = parsed.data.status === "CANCELLED";
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: isCancel ? "order.cancel" : "order.status_change",
    entity: "Order",
    entityId: orderId,
    description: isCancel
      ? `Cancelou o pedido #${order?.number}. Motivo: ${parsed.data.reason}`
      : `Marcou o pedido #${order?.number} como ${ORDER_STATUS_LABELS[parsed.data.status]}.`,
  });

  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/dashboard");

  return { success: "Pedido atualizado." };
}
