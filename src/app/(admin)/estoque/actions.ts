"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/audit-service";
import { stockMovementSchema, type StockMovementInput } from "@/lib/validations/catalog";

export async function createStockMovementAction(input: StockMovementInput) {
  const user = await requireUser();
  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId: user.tenantId },
  });
  if (!product) return { error: "Produto não encontrado." };

  let delta = 0;
  if (parsed.data.type === "IN") {
    delta = parsed.data.quantity;
  } else if (parsed.data.type === "OUT") {
    if (parsed.data.quantity > product.stockQty) {
      return { error: "Quantidade maior que o estoque disponível." };
    }
    delta = -parsed.data.quantity;
  } else {
    delta = parsed.data.quantity - product.stockQty;
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { stockQty: { increment: delta } },
    }),
    prisma.stockMovement.create({
      data: {
        tenantId: user.tenantId,
        productId: product.id,
        type: parsed.data.type,
        quantity: delta,
        reason: parsed.data.reason || null,
        userId: user.id,
      },
    }),
  ]);

  // Só ajustes manuais entram no log: entradas e saídas de rotina já ficam
  // registradas no histórico de movimentações do estoque.
  if (parsed.data.type === "ADJUST") {
    await recordAudit({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name ?? user.email ?? "Usuário",
      action: "stock.adjust",
      entity: "Product",
      entityId: product.id,
      description: `Ajustou "${product.name}" de ${product.stockQty} para ${parsed.data.quantity} unidade(s). Motivo: ${parsed.data.reason || "não informado"}`,
    });
  }

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
