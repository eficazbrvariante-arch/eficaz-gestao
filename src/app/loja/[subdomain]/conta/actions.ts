"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { customerReviewSchema, type CustomerReviewInput } from "@/lib/validations/review";
import {
  changeCustomerPasswordSchema,
  type ChangeCustomerPasswordInput,
} from "@/lib/validations/customer-auth";
import { getCustomerSession, createCustomerSession } from "@/modules/customers/customer-session";
import { submitCustomerReview } from "@/modules/catalog/review-service";
import { changeCustomerPassword } from "@/modules/customers/customer-service";

/**
 * `customerId` nunca vem do formulário — só de uma sessão de verdade,
 * resolvida aqui no servidor. Sem sessão válida, recusa sem consultar nada.
 */
export async function submitReviewAction(subdomain: string, input: CustomerReviewInput) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const session = await getCustomerSession(tenant.id);
  if (!session) return { error: "Sua sessão expirou. Atualize a página e entre novamente." };

  const parsed = customerReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise a avaliação." };
  }

  const result = await submitCustomerReview(tenant.id, session.customerId, parsed.data.productId, {
    rating: parsed.data.rating,
    comment: parsed.data.comment || null,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/loja/${subdomain}/conta`);
  revalidatePath(`/loja/${subdomain}/produto/${parsed.data.productId}`);

  return { success: true as const };
}

/**
 * `customerId` vem só da sessão (nunca do formulário). Ao trocar a senha,
 * `changeCustomerPassword` revoga todas as sessões, inclusive a atual — por
 * isso, com sucesso, abre uma sessão nova aqui pra não deslogar o cliente no
 * meio de "Minha conta".
 */
export async function changePasswordAction(subdomain: string, input: ChangeCustomerPasswordInput) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const session = await getCustomerSession(tenant.id);
  if (!session) return { error: "Sua sessão expirou. Atualize a página e entre novamente." };

  const parsed = changeCustomerPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };
  }

  const result = await changeCustomerPassword(
    tenant.id,
    session.customerId,
    parsed.data.currentPassword,
    parsed.data.newPassword
  );
  if (!result.ok) return { error: result.error };

  await createCustomerSession(tenant.id, subdomain, session.customerId);

  return { success: "Senha alterada com sucesso." };
}
