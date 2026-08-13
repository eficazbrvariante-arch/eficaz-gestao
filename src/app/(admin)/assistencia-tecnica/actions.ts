"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canEnterRepairOrderCostOnCreate,
  canGrantRepairOrderCourtesy,
  canManageFiado,
  canManageRepairOrderCostAnytime,
  canManageRepairOrders,
} from "@/lib/permissions";
import {
  createRepairOrder,
  updateRepairOrder,
  updateRepairOrderStatus,
} from "@/modules/repairs/repair-order-service";
import {
  deliverRepairOrder,
  grantRepairOrderCourtesy,
  receiveRepairOrderPayment,
} from "@/modules/repairs/repair-payment-service";
import { getOpenCashRegister } from "@/modules/cash/cash-service";
import { ensureRepairOrderReceiptUrl } from "@/modules/repairs/receipt-service";
import { recordAudit } from "@/modules/audit/audit-service";
import {
  repairOrderSchema,
  updateRepairOrderStatusSchema,
  type RepairOrderInput,
} from "@/lib/validations/repair-order";
import {
  deliverRepairOrderSchema,
  receiveRepairOrderPaymentSchema,
  repairOrderCourtesySchema,
  type DeliverRepairOrderInput,
  type ReceiveRepairOrderPaymentInput,
  type RepairOrderCourtesyInput,
} from "@/lib/validations/repair-payment";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function createRepairOrderAction(input: RepairOrderInput) {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar ordens de serviço." };
  }

  const parsed = repairOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await createRepairOrder(
    { tenantId: user.tenantId, userId: user.id },
    parsed.data,
    { canSetCost: canEnterRepairOrderCostOnCreate(user.role) }
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/assistencia-tecnica");
  redirect(`/assistencia-tecnica/${result.id}`);
}

export async function updateRepairOrderAction(id: string, input: RepairOrderInput) {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para editar ordens de serviço." };
  }

  const parsed = repairOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await updateRepairOrder(user.tenantId, id, parsed.data, {
    canWriteCostAlways: canManageRepairOrderCostAnytime(user.role),
    canWriteCostIfUnset: canEnterRepairOrderCostOnCreate(user.role),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/assistencia-tecnica");
  revalidatePath(`/assistencia-tecnica/${id}`);
  return { success: "Ordem de serviço salva." };
}

export async function updateRepairOrderStatusAction(id: string, status: string) {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar o status." };
  }

  const parsed = updateRepairOrderStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return { error: "Status inválido." };
  }

  const result = await updateRepairOrderStatus(user.tenantId, id, parsed.data.status);
  if (!result.ok) return { error: result.error };

  revalidatePath("/assistencia-tecnica");
  revalidatePath(`/assistencia-tecnica/${id}`);
  return { success: "Status atualizado." };
}

/** Entrada antecipada / recebimento parcial — não muda o status da OS. */
export async function receiveRepairOrderPaymentAction(
  id: string,
  input: ReceiveRepairOrderPaymentInput
) {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar pagamentos de assistência técnica." };
  }

  const parsed = receiveRepairOrderPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const hasFiado = parsed.data.payments.some((p) => p.method === "FIADO");
  if (hasFiado && !canManageFiado(user.role)) {
    return { error: "Seu perfil não tem permissão para vender fiado." };
  }

  const register = await getOpenCashRegister(user.tenantId);

  const result = await receiveRepairOrderPayment(
    {
      tenantId: user.tenantId,
      userId: user.id,
      cashRegisterId: register?.id ?? null,
      allowFiado: canManageFiado(user.role),
    },
    id,
    parsed.data.payments,
    { fiadoDueDate: parsed.data.fiadoDueDate || undefined }
  );
  if (!result.ok) return { error: result.error };

  const order = await prisma.repairOrder.findUnique({ where: { id }, select: { number: true } });
  const total = parsed.data.payments.reduce((sum, p) => sum + p.amount, 0);
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "repair.payment_received",
    entity: "RepairOrder",
    entityId: id,
    description: `Recebeu ${formatBRL(total)} na OS #${order?.number} (${parsed.data.payments
      .map((p) => `${p.method}: ${formatBRL(p.amount)}`)
      .join(", ")}).`,
  });

  revalidatePath(`/assistencia-tecnica/${id}`);
  revalidatePath("/assistencia-tecnica");
  revalidatePath("/caixa");

  return { success: "Pagamento registrado." };
}

/** Acerto financeiro da entrega — recebe o saldo (se houver) e marca a OS como Entregue. */
export async function deliverRepairOrderAction(id: string, input: DeliverRepairOrderInput) {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para entregar ordens de serviço." };
  }

  const parsed = deliverRepairOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const hasFiado = parsed.data.payments.some((p) => p.method === "FIADO");
  if (hasFiado && !canManageFiado(user.role)) {
    return { error: "Seu perfil não tem permissão para vender fiado." };
  }

  const register = await getOpenCashRegister(user.tenantId);

  const result = await deliverRepairOrder(
    {
      tenantId: user.tenantId,
      userId: user.id,
      cashRegisterId: register?.id ?? null,
      allowFiado: canManageFiado(user.role),
    },
    id,
    parsed.data.payments,
    { fiadoDueDate: parsed.data.fiadoDueDate || undefined }
  );
  if (!result.ok) return { error: result.error };

  const order = await prisma.repairOrder.findUnique({ where: { id }, select: { number: true } });
  const total = parsed.data.payments.reduce((sum, p) => sum + p.amount, 0);
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "repair.delivered",
    entity: "RepairOrder",
    entityId: id,
    description:
      total > 0
        ? `Entregou a OS #${order?.number}, recebendo ${formatBRL(total)} (${parsed.data.payments
            .map((p) => `${p.method}: ${formatBRL(p.amount)}`)
            .join(", ")}).`
        : `Entregou a OS #${order?.number} (já estava quitada).`,
  });

  revalidatePath(`/assistencia-tecnica/${id}`);
  revalidatePath("/assistencia-tecnica");
  revalidatePath("/caixa");

  return { success: "OS entregue." };
}

/** Cortesia administrativa — dispensa o saldo pendente sem cobrança. Só ADMIN. */
export async function grantRepairOrderCourtesyAction(id: string, input: RepairOrderCourtesyInput) {
  const user = await requireUser();
  if (!canGrantRepairOrderCourtesy(user.role)) {
    return { error: "Seu perfil não tem permissão para conceder cortesia." };
  }

  const parsed = repairOrderCourtesySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe o motivo da cortesia." };
  }

  const result = await grantRepairOrderCourtesy(
    { tenantId: user.tenantId, userId: user.id },
    id,
    parsed.data.reason
  );
  if (!result.ok) return { error: result.error };

  const order = await prisma.repairOrder.findUnique({ where: { id }, select: { number: true } });
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "repair.courtesy_grant",
    entity: "RepairOrder",
    entityId: id,
    description: `Concedeu cortesia na OS #${order?.number}. Motivo: ${parsed.data.reason}`,
  });

  revalidatePath(`/assistencia-tecnica/${id}`);
  revalidatePath("/assistencia-tecnica");

  return { success: "Cortesia concedida." };
}

/** Garante que o comprovante em PDF da OS já foi gerado, antes de compartilhar o link. */
export async function ensureRepairOrderReceiptAction(id: string) {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para gerar o comprovante." };
  }

  const result = await ensureRepairOrderReceiptUrl(id, user.tenantId);
  if (!result.ok) return { error: result.error };

  return { success: true as const, path: `/comprovante/${id}` };
}
