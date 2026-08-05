"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageProducts } from "@/lib/permissions";
import { reviewSchema, type ReviewInput } from "@/lib/validations/review";

/** Recalcula a média/contagem desnormalizadas no produto após lançar ou excluir uma avaliação. */
async function recalcProductRating(productId: string) {
  const agg = await prisma.productReview.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      avgRating: agg._count.rating > 0 ? agg._avg.rating : null,
      reviewCount: agg._count.rating,
    },
  });
}

export async function createReviewAction(productId: string, input: ReviewInput) {
  const user = await requireUser();
  if (!canManageProducts(user.role)) {
    return { error: "Seu perfil não tem permissão para lançar avaliações." };
  }

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId },
  });
  if (!product) return { error: "Produto não encontrado." };

  await prisma.productReview.create({
    data: {
      tenantId: user.tenantId,
      productId,
      authorName: parsed.data.authorName,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
      source: parsed.data.source || null,
    },
  });
  await recalcProductRating(productId);

  revalidatePath(`/produtos/${productId}/avaliacoes`);
  return { success: "Avaliação lançada." };
}

export async function deleteReviewAction(productId: string, reviewId: string) {
  const user = await requireUser();
  if (!canManageProducts(user.role)) return;

  await prisma.productReview.deleteMany({
    where: { id: reviewId, tenantId: user.tenantId, productId },
  });
  await recalcProductRating(productId);

  revalidatePath(`/produtos/${productId}/avaliacoes`);
}
