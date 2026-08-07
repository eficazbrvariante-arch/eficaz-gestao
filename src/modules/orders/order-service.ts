import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/text";
import { onlyDigits, type CheckoutInput } from "@/lib/validations/order";
import type { OrderStatus } from "@/generated/prisma/enums";
import {
  parseFlashDealSchedule,
  todayFlashDealEntry,
  flashPriceOverrideFor,
} from "@/modules/catalog/flash-deal-service";
import { isPromoActive } from "@/modules/products/catalog-price";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Encontra a faixa de entrega que atende o endereço.
 * Casa por bairro (ignorando acentos e maiúsculas) ou por faixa de CEP.
 */
export async function findDeliveryZone(
  tenantId: string,
  neighborhood: string | undefined,
  zip: string | undefined
) {
  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId, active: true },
    orderBy: { fee: "asc" },
  });

  const targetNeighborhood = neighborhood ? normalizeText(neighborhood) : null;
  const targetZip = zip ? onlyDigits(zip) : "";

  return (
    zones.find((zone) => {
      if (
        targetNeighborhood &&
        zone.neighborhood &&
        normalizeText(zone.neighborhood) === targetNeighborhood
      ) {
        return true;
      }
      if (targetZip && zone.zipStart && zone.zipEnd) {
        const start = onlyDigits(zone.zipStart);
        const end = onlyDigits(zone.zipEnd);
        if (start && end && targetZip >= start && targetZip <= end) return true;
      }
      return false;
    }) ?? null
  );
}

export type CreateOrderResult =
  | { ok: true; orderId: string; number: number }
  | { ok: false; error: string };

/**
 * Registra um pedido vindo do catálogo online.
 *
 * Os preços **nunca** vêm do navegador: são relidos do banco, então o carrinho do
 * visitante não consegue forjar valores. Tudo acontece numa transação; se algo
 * falhar, nada é gravado.
 *
 * O estoque segue a política da empresa (`Tenant.stockPolicy`):
 * - `DEDUCT`: baixa já na entrada do pedido;
 * - `RESERVE`: só baixa quando o pedido é concluído.
 */
export async function createOrder(
  tenantId: string,
  input: CheckoutInput
): Promise<CreateOrderResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      stockPolicy: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      catalogEnabled: true,
      flashDealSchedule: true,
    },
  });
  if (!tenant || !tenant.catalogEnabled) {
    return { ok: false, error: "Esta loja não está aceitando pedidos no momento." };
  }
  if (input.fulfillment === "DELIVERY" && !tenant.deliveryEnabled) {
    return { ok: false, error: "Esta loja não está fazendo entregas no momento." };
  }
  if (input.fulfillment === "PICKUP" && !tenant.pickupEnabled) {
    return { ok: false, error: "Esta loja não está aceitando retirada no momento." };
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId, active: true, showInCatalog: true },
    include: { variants: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  type ResolvedItem = {
    productId: string;
    variantId: string | null;
    nameSnapshot: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    total: number;
  };

  const resolvedItems: ResolvedItem[] = [];
  let subtotal = 0;
  let costTotal = 0;

  // Oferta Relâmpago do dia (agendada por tenant, ver flash-deal-service.ts): o
  // preço cobrado e a quantidade permitida nunca confiam no carrinho do cliente —
  // são recalculados aqui a partir da agenda, igual ao preço normal do produto logo
  // abaixo. `flashQtyUsed` soma entre linhas (ex.: duas variações do mesmo produto)
  // para o limite valer por produto, não por linha.
  const flashEntry = todayFlashDealEntry(parseFlashDealSchedule(tenant.flashDealSchedule));
  let flashQtyUsed = 0;

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return { ok: false, error: "Um dos produtos não está mais disponível." };
    }

    const variant = item.variantId
      ? product.variants.find((v) => v.id === item.variantId)
      : undefined;
    if (item.variantId && !variant) {
      return { ok: false, error: `Opção indisponível para "${product.name}".` };
    }

    const flashOverride = flashPriceOverrideFor(flashEntry, {
      id: product.id,
      salePrice: Number(product.salePrice),
    });

    // A promoção do produto (diferente da Oferta Relâmpago por dia acima) só
    // é cobrada se ainda estiver dentro da janela — sem isso, uma promoção já
    // expirada (que a vitrine já parou de mostrar como ativa) continuaria
    // sendo cobrada com o preço promocional pra sempre, já que `promoPrice`
    // nunca é limpo automaticamente do produto.
    const promoActive = isPromoActive(
      product.promoPrice === null ? null : Number(product.promoPrice),
      product.promoStartedAt,
      product.promoEndsAt
    );

    let quantity = item.quantity;
    let basePrice = Number(promoActive ? product.promoPrice : product.salePrice);
    if (flashOverride) {
      const remaining = Math.max(0, flashEntry!.orderLimit - flashQtyUsed);
      quantity = Math.min(item.quantity, remaining);
      if (quantity === 0) continue;
      flashQtyUsed += quantity;
      basePrice = flashOverride.promoPrice;
    }

    const unitPrice = round2(basePrice + Number(variant?.priceAdjustment ?? 0));
    const total = round2(unitPrice * quantity);

    resolvedItems.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      nameSnapshot: variant ? `${product.name} (${variant.name})` : product.name,
      quantity,
      unitPrice,
      unitCost: Number(product.costPrice),
      total,
    });

    subtotal = round2(subtotal + total);
    costTotal = round2(costTotal + Number(product.costPrice) * quantity);
  }

  // Taxa de entrega vem sempre da faixa cadastrada, nunca do formulário.
  let deliveryFee = 0;
  let deliveryZoneId: string | null = null;
  if (input.fulfillment === "DELIVERY") {
    const zone = await findDeliveryZone(
      tenantId,
      input.addressNeighborhood || undefined,
      input.addressZip || undefined
    );
    if (zone) {
      deliveryZoneId = zone.id;
      const freeShippingMin = zone.freeShippingMin ? Number(zone.freeShippingMin) : null;
      deliveryFee = freeShippingMin !== null && subtotal >= freeShippingMin ? 0 : Number(zone.fee);
    }
  }

  const total = round2(subtotal + deliveryFee);
  const phoneDigits = onlyDigits(input.customerPhone);

  // Reaproveita o cadastro de cliente quando o telefone bate.
  const existingCustomer = await prisma.customer.findFirst({
    where: { tenantId, phone: { contains: phoneDigits.slice(-8) } },
    select: { id: true },
  });

  const deductNow = tenant.stockPolicy === "DEDUCT";

  try {
    const order = await prisma.$transaction(async (tx) => {
      const counter = await tx.tenant.update({
        where: { id: tenantId },
        data: { orderSequence: { increment: 1 } },
        select: { orderSequence: true },
      });

      const created = await tx.order.create({
        data: {
          tenantId,
          number: counter.orderSequence,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail || null,
          customerDocument: input.customerDocument || null,
          customerId: existingCustomer?.id ?? null,
          fulfillment: input.fulfillment,
          deliveryZoneId,
          addressStreet: input.addressStreet || null,
          addressNumber: input.addressNumber || null,
          addressComplement: input.addressComplement || null,
          addressNeighborhood: input.addressNeighborhood || null,
          addressCity: input.addressCity || null,
          addressState: input.addressState || null,
          addressZip: input.addressZip || null,
          paymentMethod: input.paymentMethod,
          changeFor: input.changeFor ?? null,
          subtotal,
          deliveryFee,
          total,
          costTotal,
          notes: input.notes || null,
          stockDeductedAt: deductNow ? new Date() : null,
          items: { create: resolvedItems },
        },
        select: { id: true, number: true },
      });

      if (deductNow) {
        await applyStockDeduction(tx, tenantId, created.id, created.number, resolvedItems);
      }

      return created;
    });

    return { ok: true, orderId: order.id, number: order.number };
  } catch {
    return { ok: false, error: "Não foi possível registrar o pedido. Tente novamente." };
  }
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type StockLine = { productId: string; variantId: string | null; quantity: number };

/** Baixa o estoque dos itens e registra as movimentações do pedido. */
async function applyStockDeduction(
  tx: TxClient,
  tenantId: string,
  orderId: string,
  orderNumber: number,
  items: StockLine[]
) {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stockQty: { decrement: item.quantity } },
      });
    }
  }

  for (const [productId, quantity] of byProduct) {
    await tx.product.update({
      where: { id: productId },
      data: { stockQty: { decrement: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId,
        type: "ORDER",
        quantity: -quantity,
        reason: `Pedido online #${orderNumber}`,
        orderId,
      },
    });
  }
}

/** Devolve ao estoque os itens de um pedido que já havia baixado. */
async function revertStockDeduction(
  tx: TxClient,
  tenantId: string,
  orderId: string,
  orderNumber: number,
  items: StockLine[],
  userId: string
) {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stockQty: { increment: item.quantity } },
      });
    }
  }

  for (const [productId, quantity] of byProduct) {
    await tx.product.update({
      where: { id: productId },
      data: { stockQty: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId,
        type: "ORDER_RETURN",
        quantity,
        reason: `Cancelamento do pedido #${orderNumber}`,
        userId,
        orderId,
      },
    });
  }
}

export type UpdateOrderResult = { ok: true } | { ok: false; error: string };

/**
 * Avança ou cancela um pedido, cuidando do estoque conforme a política:
 * ao **concluir** um pedido que ainda não baixou (RESERVE), o estoque sai agora;
 * ao **cancelar** um pedido que já baixou, o estoque volta.
 */
export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  userId: string,
  status: OrderStatus,
  reason?: string
): Promise<UpdateOrderResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { items: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === status) return { ok: true };
  if (order.status === "CANCELLED") {
    return { ok: false, error: "Este pedido já está cancelado." };
  }
  if (order.status === "COMPLETED" && status !== "CANCELLED") {
    return { ok: false, error: "Este pedido já foi concluído." };
  }
  if (status === "CANCELLED" && !reason?.trim()) {
    return { ok: false, error: "Informe o motivo do cancelamento." };
  }

  const alreadyDeducted = order.stockDeductedAt !== null;
  const lines: StockLine[] = order.items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      if (status === "COMPLETED" && !alreadyDeducted) {
        await applyStockDeduction(tx, tenantId, order.id, order.number, lines);
      }
      if (status === "CANCELLED" && alreadyDeducted) {
        await revertStockDeduction(tx, tenantId, order.id, order.number, lines, userId);
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === "COMPLETED" && !alreadyDeducted
            ? { stockDeductedAt: new Date() }
            : {}),
          ...(status === "CANCELLED"
            ? {
                cancelledAt: new Date(),
                cancelReason: reason?.trim() ?? null,
                ...(alreadyDeducted ? { stockDeductedAt: null } : {}),
              }
            : {}),
        },
      });

      // Concluir vincula o pedido ao histórico do cliente cadastrado.
      if (status === "COMPLETED" && order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalSpent: { increment: order.total },
            lastPurchaseAt: new Date(),
          },
        });
      }
      if (status === "CANCELLED" && order.status === "COMPLETED" && order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { totalSpent: { decrement: order.total } },
        });
      }
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível atualizar o pedido. Tente novamente." };
  }
}
