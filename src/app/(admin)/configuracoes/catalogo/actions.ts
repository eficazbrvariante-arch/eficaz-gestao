"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteBlob } from "@/lib/blob";
import { canManageSettings } from "@/lib/permissions";
import {
  catalogSettingsSchema,
  type CatalogSettingsInput,
} from "@/lib/validations/catalog-settings";

export async function updateCatalogSettingsAction(input: CatalogSettingsInput) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar as configurações." };
  }

  const parsed = catalogSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { subdomain: true, bannerUrl: true },
  });

  const bannerUrl = parsed.data.bannerUrl || null;
  if (tenant.bannerUrl && tenant.bannerUrl !== bannerUrl) {
    await deleteBlob(tenant.bannerUrl);
  }

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      catalogEnabled: parsed.data.catalogEnabled,
      logoUrl: parsed.data.logoUrl || null,
      bannerUrl,
      bannerTitle: parsed.data.bannerTitle || null,
      bannerSubtitle: parsed.data.bannerSubtitle || null,
    },
  });

  revalidatePath("/configuracoes/catalogo");
  revalidatePath(`/loja/${tenant.subdomain}`);

  return { success: "Configurações do catálogo salvas." };
}
