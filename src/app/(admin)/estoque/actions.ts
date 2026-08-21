"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canResetStockCheckQueue } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/audit-service";
import { applyStockMovement } from "@/modules/products/stock-movement-service";
import { stockMovementSchema, type StockMovementInput } from "@/lib/validations/catalog";

export async function createStockMovementAction(input: StockMovementInput) {
  const user = await requireUser();
  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const result = await applyStockMovement(
    { tenantId: user.tenantId, userId: user.id, userName: user.name ?? user.email ?? "Usuário" },
    parsed.data
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/estoque");
  revalidatePath("/produtos");
  redirect("/estoque");
}

export async function adjustInventoryAction(formData: FormData) {
  const user = await requireUser();
  const entries = Array.from(formData.entries()).filter(([key]) => key.startsWith("qty_"));

  const productIds = entries.map(([key]) => key.replace("qty_", ""));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: user.tenantId },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const operations = [];
  for (const [key, value] of entries) {
    const productId = key.replace("qty_", "");
    const product = productMap.get(productId);
    if (!product) continue;

    const newQty = Math.max(0, Math.round(Number(value)));
    if (!Number.isFinite(newQty) || newQty === product.stockQty) continue;

    const delta = newQty - product.stockQty;
    operations.push(
      prisma.product.update({ where: { id: productId }, data: { stockQty: newQty } }),
      prisma.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId,
          type: "ADJUST",
          quantity: delta,
          reason: "Inventário",
          userId: user.id,
        },
      })
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);

    // Cada operação vira duas entradas (update + movimentação), por isso a metade.
    await recordAudit({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name ?? user.email ?? "Usuário",
      action: "stock.inventory",
      entity: "Product",
      description: `Aplicou inventário, ajustando ${operations.length / 2} produto(s).`,
    });
  }

  revalidatePath("/estoque");
  revalidatePath("/estoque/inventario");
  revalidatePath("/produtos");
  redirect("/estoque/inventario?sucesso=1");
}

/**
 * Reinicia o ciclo de contagem do Colaborador de Estoque: zera a marcação de
 * "já conferido" (`lastStockCheckAt`) de todos os produtos ativos, enchendo
 * a fila dele de novo do zero.
 */
export async function resetStockCheckQueueAction() {
  const user = await requireUser();
  if (!canResetStockCheckQueue(user.role)) {
    return { error: "Seu perfil não tem permissão para reiniciar a contagem." };
  }

  const result = await prisma.product.updateMany({
    where: { tenantId: user.tenantId, active: true, lastStockCheckAt: { not: null } },
    data: { lastStockCheckAt: null },
  });

  if (result.count > 0) {
    await recordAudit({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name ?? user.email ?? "Usuário",
      action: "stock.recount_reset",
      entity: "Product",
      description: `Reiniciou a contagem do colaborador de estoque para ${result.count} produto(s).`,
    });
  }

  revalidatePath("/colaborador-estoque");
  revalidatePath("/estoque");

  return { ok: true as const, count: result.count };
}
