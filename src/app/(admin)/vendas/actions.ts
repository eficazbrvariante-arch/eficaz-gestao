"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canCancelSale, canEditSale } from "@/lib/permissions";
import { cancelSale, editSaleItems, reportSaleItemDefect } from "@/modules/sales/sale-service";
import { recordAudit } from "@/modules/audit/audit-service";
import { formatBRL } from "@/lib/format";
import {
  cancelSaleSchema,
  editSaleSchema,
  findSaleByNumberSchema,
  reportSaleItemDefectSchema,
  type CancelSaleInput,
  type EditSaleInput,
  type FindSaleByNumberInput,
  type ReportSaleItemDefectInput,
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

  // `skipCredit` (cancelamento sem gerar crédito de loja) é uma função
  // exclusiva do Admin — mesmo que alguém force o campo no payload, um
  // Vendedor/Gerente nunca consegue ativá-lo.
  const skipCredit = parsed.data.skipCredit === true && user.role === "ADMIN";

  const result = await cancelSale(
    user.tenantId,
    saleId,
    user.id,
    parsed.data.reason,
    parsed.data.customerId || null,
    skipCredit
  );
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
    description: skipCredit
      ? `Cancelou a venda #${sale?.number} (R$ ${sale?.total}) sem gerar crédito de loja (cancelamento administrativo). Motivo: ${parsed.data.reason}`
      : `Cancelou a venda #${sale?.number} (R$ ${sale?.total}). Motivo: ${parsed.data.reason}`,
  });

  revalidatePath("/vendas");
  revalidatePath(`/vendas/${saleId}`);
  revalidatePath("/caixa");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  revalidatePath("/clientes");

  return { success: "Venda cancelada e crédito gerado para o cliente." };
}

export async function editSaleAction(saleId: string, input: EditSaleInput) {
  const user = await requireUser();
  if (!canEditSale(user.role)) {
    return { error: "Seu perfil não tem permissão para editar vendas." };
  }

  const parsed = editSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe os valores corrigidos." };
  }

  const result = await editSaleItems(user.tenantId, saleId, user.id, parsed.data.edits);
  if (!result.ok) return { error: result.error };

  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { number: true, total: true } });
  const description = result.changes
    .map(
      (c) =>
        `"${c.nameSnapshot}": preço ${formatBRL(c.before.unitPrice)} → ${formatBRL(c.after.unitPrice)}, desconto ${formatBRL(c.before.discount)} → ${formatBRL(c.after.discount)}`
    )
    .join("; ");
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "sale.edit",
    entity: "Sale",
    entityId: saleId,
    description: `Corrigiu a venda #${sale?.number} — ${description}. Total mantido em ${formatBRL(Number(sale?.total ?? 0))}.`,
  });

  revalidatePath(`/vendas/${saleId}`);
  revalidatePath("/vendas");

  return { success: "Venda corrigida." };
}

export async function reportSaleItemDefectAction(saleId: string, input: ReportSaleItemDefectInput) {
  const user = await requireUser();
  if (!canCancelSale(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar trocas." };
  }

  const parsed = reportSaleItemDefectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Preencha o motivo e a foto do defeito." };
  }

  const result = await reportSaleItemDefect(user.tenantId, saleId, user.id, {
    saleItemId: parsed.data.saleItemId,
    quantity: parsed.data.quantity,
    reason: parsed.data.reason,
    photoUrls: parsed.data.photoUrls,
    creditCustomerId: parsed.data.customerId || null,
  });
  if (!result.ok) return { error: result.error };

  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { number: true } });
  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "sale.item_defect",
    entity: "Sale",
    entityId: saleId,
    description: `Registrou troca por defeito na venda #${sale?.number}. Motivo: ${parsed.data.reason}`,
  });

  revalidatePath(`/vendas/${saleId}`);
  revalidatePath("/clientes");

  return { success: "Troca registrada e crédito gerado para o cliente." };
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
