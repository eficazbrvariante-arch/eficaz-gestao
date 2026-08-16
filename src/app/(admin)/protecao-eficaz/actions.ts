"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageProtecaoEficaz } from "@/lib/permissions";
import {
  approveProtecaoEficaz,
  rejectProtecaoEficaz,
  markProtecaoEficazRedeemed,
} from "@/modules/protecao-eficaz/protecao-eficaz-service";

export async function approveProtecaoEficazAction(registrationId: string) {
  const user = await requireUser();
  if (!canManageProtecaoEficaz(user.role)) {
    return { error: "Seu perfil não tem permissão para validar a Proteção Eficaz." };
  }

  const result = await approveProtecaoEficaz(user.tenantId, registrationId, user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/protecao-eficaz");
  return { success: "Cadastro aprovado." };
}

export async function rejectProtecaoEficazAction(registrationId: string, reason: string) {
  const user = await requireUser();
  if (!canManageProtecaoEficaz(user.role)) {
    return { error: "Seu perfil não tem permissão para validar a Proteção Eficaz." };
  }

  const result = await rejectProtecaoEficaz(user.tenantId, registrationId, user.id, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath("/protecao-eficaz");
  return { success: "Cadastro rejeitado." };
}

export async function markProtecaoEficazRedeemedAction(registrationId: string) {
  const user = await requireUser();
  if (!canManageProtecaoEficaz(user.role)) {
    return { error: "Seu perfil não tem permissão para validar a Proteção Eficaz." };
  }

  const result = await markProtecaoEficazRedeemed(user.tenantId, registrationId, user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/protecao-eficaz");
  return { success: "Troca registrada." };
}
