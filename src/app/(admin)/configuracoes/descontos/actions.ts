"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import {
  comboDiscountSettingsSchema,
  type ComboDiscountSettingsInput,
} from "@/lib/validations/combo-discount";

export async function updateComboDiscountSettingsAction(input: ComboDiscountSettingsInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = comboDiscountSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { comboDiscountSettings: parsed.data },
  });

  // O PDV lê essas palavras no carregamento da página pra calcular o desconto
  // ao vivo — sem revalidar aqui, o caixa continuaria com a lista antiga até
  // a próxima recarga.
  revalidatePath("/configuracoes/descontos");
  revalidatePath("/pdv");

  return { success: "Regra de desconto por combo salva." };
}
