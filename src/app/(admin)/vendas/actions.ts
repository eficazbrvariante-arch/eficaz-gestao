"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canCancelSale } from "@/lib/permissions";
import { cancelSale } from "@/modules/sales/sale-service";
import { recordAudit } from "@/modules/audit/audit-service";
import {
  cancelSaleSchema,
  findSaleByNumberSchema,
  type CancelSaleInput,
  type FindSaleByNumberInput,
} from "@/lib/validations/sale";

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

/**
 * Localiza uma venda pelo número do cupom (não pelo id interno) — é o que o
 * cliente tem em mãos pra pedir uma troca. Qualquer papel que vende pode
 * usar: não abre acesso a mais nada além do que já era possível abrindo o
 * link direto do comprovante (/vendas/{id}), que nunca teve trava por papel.
 */
export async function findSaleByNumberAction(input: FindSaleByNumberInput) {
  const user = await requireUser();

  const parsed = findSaleByNumberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe um número de cupom válido." };
  }

  const sale = await prisma.sale.findUnique({
    where: { tenantId_number: { tenantId: user.tenantId, number: parsed.data.number } },
    select: { id: true },
  });

  if (!sale) {
    return { error: `Nenhuma venda encontrada com o número #${parsed.data.number}.` };
  }

  return { saleId: sale.id };
}
