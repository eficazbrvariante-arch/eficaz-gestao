"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageFlashDeals } from "@/lib/permissions";
import {
  flashDealScheduleSchema,
  type FlashDealScheduleInput,
} from "@/lib/validations/flash-deal";

export async function updateFlashDealScheduleAction(input: FlashDealScheduleInput) {
  const user = await requireUser();
  if (!canManageFlashDeals(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar a Oferta Relâmpago." };
  }

  const parsed = flashDealScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { subdomain: true },
  });

  // O schema transforma "vazio" em `undefined` (pra poder revalidar o próprio
  // resultado sem quebrar `.optional()`) — aqui, na escrita, vira `null`, que
  // é o formato que `flashDealSchedule` (Json) e `parseFlashDealSchedule`
  // esperam. `undefined` sumiria da chave ao serializar o JSON.
  const schedule = parsed.data.schedule.map((entry) => ({
    ...entry,
    productId: entry.productId ?? null,
    promoPrice: entry.promoPrice ?? null,
  }));

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { flashDealSchedule: schedule },
  });

  revalidatePath("/configuracoes/oferta-relampago");
  revalidatePath(`/loja/${tenant.subdomain}`, "layout");

  return { success: "Oferta Relâmpago salva." };
}
