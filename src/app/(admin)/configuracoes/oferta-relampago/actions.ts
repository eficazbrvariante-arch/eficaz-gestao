"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import {
  flashDealScheduleSchema,
  type FlashDealScheduleInput,
} from "@/lib/validations/flash-deal";

export async function updateFlashDealScheduleAction(input: FlashDealScheduleInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = flashDealScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { subdomain: true },
  });

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { flashDealSchedule: parsed.data.schedule },
  });

  revalidatePath("/configuracoes/oferta-relampago");
  revalidatePath(`/loja/${tenant.subdomain}`, "layout");

  return { success: "Oferta Relâmpago salva." };
}
