"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import { onlyDigits } from "@/lib/validations/order";
import {
  deliverySettingsSchema,
  deliveryZoneSchema,
  type DeliverySettingsInput,
  type DeliveryZoneInput,
} from "@/lib/validations/order";

function revalidateAll() {
  revalidatePath("/configuracoes/entrega");
  revalidatePath("/pedidos");
}

export async function updateDeliverySettingsAction(input: DeliverySettingsInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = deliverySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!parsed.data.deliveryEnabled && !parsed.data.pickupEnabled) {
    return { error: "Mantenha ao menos uma opção ativa: entrega ou retirada." };
  }

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      deliveryEnabled: parsed.data.deliveryEnabled,
      pickupEnabled: parsed.data.pickupEnabled,
      stockPolicy: parsed.data.stockPolicy,
      pickupNotes: parsed.data.pickupNotes || null,
    },
  });

  revalidateAll();
  return { success: "Configurações de entrega salvas." };
}

export async function createDeliveryZoneAction(input: DeliveryZoneInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = deliveryZoneSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { neighborhood, zipStart, zipEnd } = parsed.data;
  if (!neighborhood?.trim() && !(zipStart?.trim() && zipEnd?.trim())) {
    return {
      error: "Informe um bairro ou uma faixa de CEP (início e fim) para identificar a região.",
    };
  }

  await prisma.deliveryZone.create({
    data: {
      tenantId: user.tenantId,
      name: parsed.data.name,
      neighborhood: neighborhood || null,
      zipStart: zipStart ? onlyDigits(zipStart) : null,
      zipEnd: zipEnd ? onlyDigits(zipEnd) : null,
      fee: parsed.data.fee,
      estimate: parsed.data.estimate || null,
      active: parsed.data.active,
    },
  });

  revalidateAll();
  return { success: "Faixa de entrega criada." };
}

export async function deleteDeliveryZoneAction(id: string) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) return;

  await prisma.deliveryZone.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidateAll();
}
