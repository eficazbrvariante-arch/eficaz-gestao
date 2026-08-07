"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { customerReviewSchema, type CustomerReviewInput } from "@/lib/validations/review";
import { getCustomerSession } from "@/modules/customers/customer-session";
import { submitCustomerReview } from "@/modules/catalog/review-service";

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
