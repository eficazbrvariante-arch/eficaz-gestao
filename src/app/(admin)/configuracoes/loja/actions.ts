"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import {
  storeSettingsSchema,
  type StoreSettingsInput,
} from "@/lib/validations/store-settings";

export async function updateStoreSettingsAction(input: StoreSettingsInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = storeSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { subdomain: true },
  });

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      businessHours: parsed.data.businessHours,
      aboutText: parsed.data.aboutText || null,
      exchangePolicy: parsed.data.exchangePolicy || null,
      warrantyPolicy: parsed.data.warrantyPolicy || null,
      privacyPolicy: parsed.data.privacyPolicy || null,
      acceptedPaymentMethods: parsed.data.acceptedPaymentMethods,
      // Sem parcelamento habilitado, os campos ficam nulos — o card nunca
      // calcula parcelas sem uma regra explicitamente configurada pela loja.
      maxInstallments: parsed.data.installmentsEnabled ? parsed.data.maxInstallments ?? null : null,
      minInstallmentValue: parsed.data.installmentsEnabled
        ? (parsed.data.minInstallmentValue ?? null)
        : null,
    },
  });

  revalidatePath("/configuracoes/loja");
  revalidatePath(`/loja/${tenant.subdomain}`, "layout");

  return { success: "Configurações da loja salvas." };
}
