import { prisma } from "@/lib/prisma";
import type { RepairOrderInput } from "@/lib/validations/repair-order";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/validations/repair-order";
import type { RepairOrderStatus } from "@/generated/prisma/enums";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Aceita `number`/`string` (input já validado) ou `Decimal` (lido direto do Prisma). */
type Numeric = number | string | { toString(): string };

export function servicesTotal(items: { unitPrice: Numeric; quantity: number }[]) {
  return round2(items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0));
}

/** Total da OS (serviços − desconto) — nunca persistido, sempre recalculado. */
export function repairOrderTotal(items: { unitPrice: Numeric; quantity: number }[], discount: Numeric) {
  return round2(Math.max(0, servicesTotal(items) - Number(discount)));
}

/** `YYYY-MM-DD` (fuso de Brasília) para `Date`, ao meio-dia para não escorregar de dia. */
function parseDateOnly(value: string | undefined | null) {
  if (!value) return null;
  return new Date(`${value}T12:00:00-03:00`);
}

export type RepairOrderContext = { tenantId: string; userId: string };
export type RepairOrderResult =
  | { ok: true; id: string; number: number }
  | { ok: false; error: string };

export async function createRepairOrder(
  ctx: RepairOrderContext,
  input: RepairOrderInput,
  options: { canSetCost: boolean }
): Promise<RepairOrderResult> {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  const total = servicesTotal(input.items);
  if (input.discount > total + 0.005) {
    return { ok: false, error: "O desconto não pode ser maior que o total dos serviços." };
  }

  // Garantia: revalidado aqui de novo (nunca confia só no formulário) — só
  // vincula a uma OS que existe neste tenant e já foi entregue. Nunca reabre
  // a original, só referencia — o financeiro dela fica intocado.
  let warrantyOriginal: { id: string; number: number } | null = null;
  if (input.warrantyOriginalId) {
    const original = await prisma.repairOrder.findFirst({
      where: { id: input.warrantyOriginalId, tenantId: ctx.tenantId, status: "DELIVERED" },
      select: { id: true, number: true },
    });
    if (!original) {
      return { ok: false, error: "OS original da garantia não encontrada ou ainda não entregue." };
    }
    warrantyOriginal = original;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Incremento atômico garante numeração única mesmo com OS abertas ao mesmo tempo.
      const tenant = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { repairOrderSequence: { increment: 1 } },
        select: { repairOrderSequence: true },
      });

      const created = await tx.repairOrder.create({
        data: {
          tenantId: ctx.tenantId,
          number: tenant.repairOrderSequence,
          customerId: input.customerId,
          sellerId: input.sellerId,
          brand: input.brand,
          model: input.model,
          color: input.color || null,
          imei: input.imei || null,
          passcode: input.passcode || null,
          turnsOn: input.turnsOn,
          condition: input.condition || null,
          reportedDefects: input.reportedDefects || null,
          internalNotes: input.internalNotes || null,
          estimatedAt: parseDateOnly(input.estimatedAt),
          discount: input.discount,
          costPrice: options.canSetCost ? (input.costPrice ?? null) : null,
          createdById: ctx.userId,
          warrantyOriginalId: warrantyOriginal?.id ?? null,
          items: {
            create: input.items.map((item) => ({
              description: item.description,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
            })),
          },
          photos: {
            create: input.photoUrls.map((url, index) => ({ url, order: index })),
          },
          events: {
            create: {
              message: warrantyOriginal
                ? `Ordem de serviço criada — garantia da OS #${warrantyOriginal.number}`
                : "Ordem de serviço criada",
            },
          },
        },
        select: { id: true, number: true },
      });

      if (warrantyOriginal) {
        await tx.repairOrderEvent.create({
          data: {
            repairOrderId: warrantyOriginal.id,
            message: `Garantia acionada — nova OS #${created.number}`,
          },
        });
      }

      return created;
    });

    return { ok: true, id: result.id, number: result.number };
  } catch {
    return { ok: false, error: "Não foi possível criar a ordem de serviço. Tente novamente." };
  }
}

export async function updateRepairOrder(
  tenantId: string,
  id: string,
  input: RepairOrderInput,
  options: { canWriteCostAlways: boolean; canWriteCostIfUnset: boolean }
): Promise<RepairOrderResult> {
  const existing = await prisma.repairOrder.findFirst({
    where: { id, tenantId },
    select: { id: true, number: true, costPrice: true },
  });
  if (!existing) return { ok: false, error: "Ordem de serviço não encontrada." };

  // Gerente só grava o custo enquanto ninguém tiver informado um valor nesta
  // OS ainda — em qualquer outra OS, mesmo criada por outra pessoa, vale a
  // mesma regra. Depois de salvo uma vez, só ADMIN mexe.
  const canWriteCost =
    options.canWriteCostAlways || (options.canWriteCostIfUnset && existing.costPrice === null);

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId },
    select: { id: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  const total = servicesTotal(input.items);
  if (input.discount > total + 0.005) {
    return { ok: false, error: "O desconto não pode ser maior que o total dos serviços." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Serviços e fotos não têm identidade própria fora da OS: mais simples
      // recriar a lista do que calcular o diff a cada edição.
      await tx.repairOrderItem.deleteMany({ where: { repairOrderId: id } });
      await tx.repairOrderPhoto.deleteMany({ where: { repairOrderId: id } });

      await tx.repairOrder.update({
        where: { id },
        data: {
          customerId: input.customerId,
          sellerId: input.sellerId,
          brand: input.brand,
          model: input.model,
          color: input.color || null,
          imei: input.imei || null,
          passcode: input.passcode || null,
          turnsOn: input.turnsOn,
          condition: input.condition || null,
          reportedDefects: input.reportedDefects || null,
          internalNotes: input.internalNotes || null,
          estimatedAt: parseDateOnly(input.estimatedAt),
          discount: input.discount,
          // O PDF cacheado fica desatualizado sempre que itens/desconto mudam
          // (afeta o total) — `null` força `ensureRepairOrderReceiptUrl` a
          // gerar de novo na próxima vez que alguém pedir o comprovante.
          receiptPdfUrl: null,
          // Omitido (não `null`) quando quem chamou não pode mexer no custo: um
          // update parcial do Prisma não toca no campo se a chave não existir,
          // preservando o valor gravado por quem tinha permissão antes.
          ...(canWriteCost ? { costPrice: input.costPrice ?? null } : {}),
          items: {
            create: input.items.map((item) => ({
              description: item.description,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
            })),
          },
          photos: {
            create: input.photoUrls.map((url, index) => ({ url, order: index })),
          },
        },
      });
    });

    return { ok: true, id: existing.id, number: existing.number };
  } catch {
    return { ok: false, error: "Não foi possível salvar a ordem de serviço. Tente novamente." };
  }
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function updateRepairOrderStatus(
  tenantId: string,
  id: string,
  status: RepairOrderStatus
): Promise<SimpleResult> {
  const existing = await prisma.repairOrder.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "Ordem de serviço não encontrada." };
  if (existing.status === status) return { ok: true };

  // "Entregue" só acontece através do acerto financeiro (ver `deliverRepairOrder`,
  // em `repair-payment-service.ts`) — nunca como uma troca de status solta, pra
  // nunca liberar um aparelho com saldo pendente sem passar pela cobrança. Pelo
  // mesmo motivo, uma OS já entregue não sai desse status por aqui: sem essa
  // trava, dava pra "reabrir" a OS chamando a action direto e rodar
  // `deliverRepairOrder` de novo sobre um aparelho que já saiu da loja.
  if (status === "DELIVERED" || existing.status === "DELIVERED") {
    return {
      ok: false,
      error:
        existing.status === "DELIVERED"
          ? "Esta OS já foi entregue e não pode voltar a um status anterior."
          : "Para marcar como entregue, conclua o acerto financeiro da OS.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.repairOrder.update({
        where: { id },
        data: { status, receiptPdfUrl: null },
      });
      await tx.repairOrderEvent.create({
        data: {
          repairOrderId: id,
          message: `Status alterado para "${REPAIR_ORDER_STATUS_LABELS[status]}"`,
        },
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível atualizar o status. Tente novamente." };
  }
}
