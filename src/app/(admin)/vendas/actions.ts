"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canCancelSale } from "@/lib/permissions";
import { cancelSale } from "@/modules/sales/sale-service";
import { recordAudit } from "@/modules/audit/audit-service";
import { cancelSaleSchema, type CancelSaleInput } from "@/lib/validations/sale";

export async function cancelSaleAction(saleId: string, input: CancelSaleInput) {
  const user = await requireUser();
  if (!canCancelSale(user.role)) {
    return { error: "Seu perfil não tem permissão para cancelar vendas." };
  }

  const parsed = cancelSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe o motivo do cancelamento." };
  }

  const result = await cancelSale(user.tenantId, saleId, user.id, parsed.data.reason);
  if (!result.ok) return { error: result.error };

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { number: true, total: true },
  });
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "sale.cancel",
    entity: "Sale",
    entityId: saleId,
    description: `Cancelou a venda #${sale?.number} (R$ ${sale?.total}). Motivo: ${parsed.data.reason}`,
  });

  revalidatePath("/vendas");
  revalidatePath(`/vendas/${saleId}`);
  revalidatePath("/caixa");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/dashboard");

  return { success: "Venda cancelada e estoque devolvido." };
}
