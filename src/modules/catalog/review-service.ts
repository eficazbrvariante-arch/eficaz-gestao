import { prisma } from "@/lib/prisma";

/** Recalcula a média/contagem desnormalizadas no produto após lançar, editar ou excluir uma avaliação. */
export async function recalcProductRating(productId: string) {
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

/**
 * O cliente comprou mesmo esse produto, com um pedido/venda concluídos? Cobre
 * tanto o pedido online (`Order`/`OrderItem`) quanto a venda física do PDV
 * (`Sale`/`SaleItem`, quando o vendedor identifica o cliente) — mesma
 * condição de "compra genuína" já usada em `sumSoldQuantities`
 * (`catalog-service.ts`). `tenantId` combinado em toda consulta: nunca deixa
 * um `customerId`/`productId` de outra loja contar aqui.
 */
export async function hasCustomerPurchasedProduct(
  tenantId: string,
  customerId: string,
  productId: string
): Promise<boolean> {
  const [orderItem, saleItem] = await Promise.all([
    prisma.orderItem.findFirst({
      where: { productId, order: { tenantId, customerId, status: "COMPLETED" } },
      select: { id: true },
    }),
    prisma.saleItem.findFirst({
      where: { productId, sale: { tenantId, customerId, status: "COMPLETED" } },
      select: { id: true },
    }),
  ]);
  return orderItem !== null || saleItem !== null;
}

export type ReviewableProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  myReview: { rating: number; comment: string | null } | null;
};

/**
 * Produtos distintos que o cliente já comprou (pedido ou venda concluídos),
 * indicando se ele já avaliou cada um — para a UI de "/conta" decidir entre
 * "avaliar" e "editar sua avaliação".
 */
export async function listReviewableProducts(
  tenantId: string,
  customerId: string
): Promise<ReviewableProduct[]> {
  const [orderItems, saleItems, myReviews] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { tenantId, customerId, status: "COMPLETED" } },
      select: { product: { select: { id: true, name: true, images: { take: 1, select: { url: true } } } } },
    }),
    prisma.saleItem.findMany({
      where: { sale: { tenantId, customerId, status: "COMPLETED" } },
      select: { product: { select: { id: true, name: true, images: { take: 1, select: { url: true } } } } },
    }),
    prisma.productReview.findMany({
      where: { tenantId, customerId },
      select: { productId: true, rating: true, comment: true },
    }),
  ]);

  const reviewByProduct = new Map(myReviews.map((r) => [r.productId, r]));
  const byProduct = new Map<string, ReviewableProduct>();
  for (const { product } of [...orderItems, ...saleItems]) {
    if (byProduct.has(product.id)) continue;
    const review = reviewByProduct.get(product.id);
    byProduct.set(product.id, {
      id: product.id,
      name: product.name,
      imageUrl: product.images[0]?.url ?? null,
      myReview: review ? { rating: review.rating, comment: review.comment } : null,
    });
  }
  return [...byProduct.values()];
}

export type SubmitCustomerReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Envia (ou edita, reenviando) a avaliação de compra verificada de um
 * cliente logado. `customerId` nunca vem do payload do navegador — só é
 * aceito aqui porque o chamador (`submitReviewAction`) já o resolveu
 * exclusivamente a partir da sessão (`getCustomerSession`).
 */
export async function submitCustomerReview(
  tenantId: string,
  customerId: string,
  productId: string,
  data: { rating: number; comment: string | null }
): Promise<SubmitCustomerReviewResult> {
  const [product, purchased] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } }),
    hasCustomerPurchasedProduct(tenantId, customerId, productId),
  ]);
  if (!product) return { ok: false, error: "Produto não encontrado." };
  if (!purchased) {
    return { ok: false, error: "Você só pode avaliar produtos que já comprou nesta loja." };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { name: true },
  });
  if (!customer) return { ok: false, error: "Não foi possível identificar sua conta." };

  await prisma.$transaction(async (tx) => {
    await tx.productReview.upsert({
      where: { tenantId_productId_customerId: { tenantId, productId, customerId } },
      create: {
        tenantId,
        productId,
        customerId,
        authorName: customer.name,
        rating: data.rating,
        comment: data.comment,
      },
      update: {
        rating: data.rating,
        comment: data.comment,
      },
    });

    const agg = await tx.productReview.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        avgRating: agg._count.rating > 0 ? agg._avg.rating : null,
        reviewCount: agg._count.rating,
      },
    });
  });

  return { ok: true };
}
