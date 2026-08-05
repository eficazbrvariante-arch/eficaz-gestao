"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import { pdvSettingsSchema, type PdvSettingsInput } from "@/lib/validations/pdv-settings";

export async function updatePdvSettingsAction(input: PdvSettingsInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = pdvSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { autoPrintReceipt: parsed.data.autoPrintReceipt },
  });

  revalidatePath("/configuracoes/pdv");

  return { success: "Configurações do PDV salvas." };
}
