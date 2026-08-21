import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/audit-service";

export type ApplyStockMovementResult =
  | { ok: true; stockQty: number }
  | { ok: false; error: string };

/**
 * Núcleo compartilhado de toda movimentação de estoque (entrada, saída,
 * ajuste): recalcula o delta, grava produto + `StockMovement` na mesma
 * transação e audita ajustes manuais. Usado pelo formulário dedicado
 * (`/estoque/novo`, que redireciona ao terminar) e pelo ajuste rápido inline
 * na listagem de Produtos (que só atualiza a linha, sem navegar).
 */
export async function applyStockMovement(
  ctx: { tenantId: string; userId: string; userName: string },
  input: { productId: string; type: "IN" | "OUT" | "ADJUST"; quantity: number; reason?: string }
): Promise<ApplyStockMovementResult> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: ctx.tenantId },
  });
  if (!product) return { ok: false, error: "Produto não encontrado." };

  let delta = 0;
  if (input.type === "IN") {
    delta = input.quantity;
  } else if (input.type === "OUT") {
    if (input.quantity > product.stockQty) {
      return { ok: false, error: "Quantidade maior que o estoque disponível." };
    }
    delta = -input.quantity;
  } else {
    delta = input.quantity - product.stockQty;
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { stockQty: { increment: delta } },
    }),
    prisma.stockMovement.create({
      data: {
        tenantId: ctx.tenantId,
        productId: product.id,
        type: input.type,
        quantity: delta,
        reason: input.reason || null,
        userId: ctx.userId,
      },
    }),
  ]);

  // Só ajustes manuais entram no log de auditoria: entradas e saídas de
  // rotina já ficam registradas no histórico de movimentações do estoque.
  if (input.type === "ADJUST") {
    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userName: ctx.userName,
      action: "stock.adjust",
      entity: "Product",
      entityId: product.id,
      description: `Ajustou "${product.name}" de ${product.stockQty} para ${input.quantity} unidade(s). Motivo: ${input.reason || "não informado"}`,
    });
  }

  return { ok: true, stockQty: product.stockQty + delta };
}
