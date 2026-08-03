"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canQuickEditStockQty } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { quickStockAdjustSchema } from "@/lib/validations/catalog";

/**
 * Único jeito de gravar estoque a partir desta tela: recebe só id + quantidade,
 * nunca lê nem devolve preço — o Colaborador de Estoque não tem acesso a isso
 * em nenhuma outra parte do painel (ver `src/proxy.ts`).
 */
export async function updateStockQtyAction(productId: string, quantity: number) {
  const user = await requireUser();
  if (!canQuickEditStockQty(user.role)) {
    return { error: "Seu perfil não tem permissão para ajustar o estoque." };
  }

  const parsed = quickStockAdjustSchema.safeParse({ productId, quantity });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId: user.tenantId },
    select: { id: true, stockQty: true },
  });
  if (!product) return { error: "Produto não encontrado." };

  const delta = parsed.data.quantity - product.stockQty;
  if (delta === 0) return { ok: true as const, stockQty: product.stockQty };

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { stockQty: parsed.data.quantity },
    }),
    prisma.stockMovement.create({
      data: {
        tenantId: user.tenantId,
        productId: product.id,
        type: "ADJUST",
        quantity: delta,
        reason: "Ajuste rápido (colaborador de estoque)",
        userId: user.id,
      },
    }),
  ]);

  revalidatePath("/colaborador-estoque");
  revalidatePath("/estoque");
  revalidatePath("/produtos");

  return { ok: true as const, stockQty: parsed.data.quantity };
}
