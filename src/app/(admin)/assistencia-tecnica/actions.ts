"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  canEnterRepairOrderCostOnCreate,
  canManageRepairOrderCostAnytime,
  canManageRepairOrders,
} from "@/lib/permissions";
import {
  createRepairOrder,
  updateRepairOrder,
  updateRepairOrderStatus,
} from "@/modules/repairs/repair-order-service";
import { ensureRepairOrderReceiptUrl } from "@/modules/repairs/receipt-service";
import {
  repairOrderSchema,
  updateRepairOrderStatusSchema,
  type RepairOrderInput,
} from "@/lib/validations/repair-order";

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
