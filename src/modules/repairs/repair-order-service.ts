import { prisma } from "@/lib/prisma";
import type { RepairOrderInput } from "@/lib/validations/repair-order";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/validations/repair-order";
import type { RepairOrderStatus } from "@/generated/prisma/enums";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function servicesTotal(items: { unitPrice: number; quantity: number }[]) {
  return round2(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
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

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Incremento atômico garante numeração única mesmo com OS abertas ao mesmo tempo.
      const tenant = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { repairOrderSequence: { increment: 1 } },
        select: { repairOrderSequence: true },
      });

      return tx.repairOrder.create({
        data: {
          tenantId: ctx.tenantId,
          number: tenant.repairOrderSequence,
          customerId: input.customerId,
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
          events: { create: { message: "Ordem de serviço criada" } },
        },
        select: { id: true, number: true },
      });
    });

    return { ok: true, id: created.id, number: created.number };
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.repairOrder.update({
        where: { id },
        data: {
          status,
          pickedUpAt: status === "DELIVERED" ? new Date() : undefined,
        },
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
