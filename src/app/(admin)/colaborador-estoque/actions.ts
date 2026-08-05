"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canQuickEditStockQty } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { confirmStockCheckSchema, type ConfirmStockCheckInput } from "@/lib/validations/catalog";

/**
 * Confirma um item da fila de contagem: grava a quantidade, anexa a foto
 * quando o produto ainda não tinha nenhuma, e marca `lastStockCheckAt` — é
 * essa marca que tira o produto da fila do colaborador (ver `page.tsx`).
 * Nunca lê nem devolve preço — o Colaborador de Estoque não tem acesso a
 * isso em nenhuma outra parte do painel (ver `src/proxy.ts`).
 */
export async function confirmStockCheckAction(input: ConfirmStockCheckInput) {
  const user = await requireUser();
  if (!canQuickEditStockQty(user.role)) {
    return { error: "Seu perfil não tem permissão para ajustar o estoque." };
  }

  const parsed = confirmStockCheckSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId: user.tenantId },
    select: { id: true, stockQty: true, images: { select: { id: true }, take: 1 } },
  });
  if (!product) return { error: "Produto não encontrado." };

  const photoUrl = parsed.data.photoUrl || "";
  if (product.images.length === 0 && !photoUrl) {
    return { error: "Adicione uma foto antes de confirmar." };
  }

  const delta = parsed.data.quantity - product.stockQty;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { stockQty: parsed.data.quantity, lastStockCheckAt: new Date() },
    });

    if (delta !== 0) {
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId: product.id,
          type: "ADJUST",
          quantity: delta,
          reason: "Contagem (colaborador de estoque)",
          userId: user.id,
        },
      });
    }

    if (photoUrl && product.images.length === 0) {
      await tx.productImage.create({
        data: { productId: product.id, url: photoUrl, order: 0 },
      });
    }
  });

  revalidatePath("/colaborador-estoque");
  revalidatePath("/estoque");
  revalidatePath("/produtos");

  return { ok: true as const };
}
