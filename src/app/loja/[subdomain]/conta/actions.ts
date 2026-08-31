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
import {
  submitProtecaoEficazSchema,
  type SubmitProtecaoEficazFormValues,
} from "@/lib/validations/protecao-eficaz";
import { submitProtecaoEficazRegistration } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import {
  submitCreditoEficazApplicationSchema,
  CREDITO_EFICAZ_TERMS_VERSION,
  type SubmitCreditoEficazApplicationFormValues,
} from "@/lib/validations/credito-eficaz";
import {
  getOrCreateDraftApplication,
  updateDraftApplication,
  addApplicationDocument,
  setCreditoEficazPin,
  submitApplication,
} from "@/modules/credito-eficaz/credito-eficaz-service";

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

  revalidatePath(`/loja/${subdomain}/conta/compras`);
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

/**
 * `customerId` vem só da sessão. A checagem de elegibilidade real (a venda
 * existe, tem capinha + película, o cliente marcou no PDV) não acontece
 * aqui — é sempre manual, na aprovação do Admin (ver
 * `approveProtecaoEficaz`). Aqui só grava o cadastro como pendente.
 */
export async function submitProtecaoEficazAction(
  subdomain: string,
  input: SubmitProtecaoEficazFormValues
) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const session = await getCustomerSession(tenant.id);
  if (!session) return { error: "Sua sessão expirou. Atualize a página e entre novamente." };

  const parsed = submitProtecaoEficazSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };
  }

  const result = await submitProtecaoEficazRegistration(tenant.id, session.customerId, {
    saleNumber: parsed.data.saleNumber,
    proofPhotoUrl: parsed.data.proofPhotoUrl,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/loja/${subdomain}/conta/protecao-eficaz`);

  return { success: true as const };
}

/**
 * Envio único da solicitação de Crédito Eficaz — reaproveita o rascunho
 * aberto (`getOrCreateDraftApplication`) se houver, preenche os dados,
 * anexa os três documentos (já enviados ao Blob privado pelo formulário),
 * define o PIN de confirmação e manda pra análise, tudo numa chamada só.
 * `customerId` nunca vem do formulário, só da sessão.
 */
export async function submitCreditoEficazApplicationAction(
  subdomain: string,
  input: SubmitCreditoEficazApplicationFormValues
) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const session = await getCustomerSession(tenant.id);
  if (!session) return { error: "Sua sessão expirou. Atualize a página e entre novamente." };

  const parsed = submitCreditoEficazApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };
  }

  const draft = await getOrCreateDraftApplication(tenant.id, session.customerId);
  if (!draft.ok) return { error: draft.error };

  const updated = await updateDraftApplication(tenant.id, session.customerId, draft.application.id, {
    occupation: parsed.data.occupation || null,
    income: parsed.data.income ?? null,
    bestDueDay: parsed.data.bestDueDay ?? null,
    additionalNotes: parsed.data.additionalNotes || null,
  });
  if (!updated.ok) return { error: updated.error };

  const documents: Array<[ "ID_DOCUMENT" | "RESIDENCE_PROOF" | "SELFIE", string ]> = [
    ["ID_DOCUMENT", parsed.data.idDocumentPathname],
    ["RESIDENCE_PROOF", parsed.data.residenceProofPathname],
    ["SELFIE", parsed.data.selfiePathname],
  ];
  for (const [type, pathname] of documents) {
    const added = await addApplicationDocument(tenant.id, session.customerId, draft.application.id, type, pathname);
    if (!added.ok) return { error: added.error };
  }

  const pinResult = await setCreditoEficazPin(tenant.id, session.customerId, parsed.data.pin);
  if (!pinResult.ok) return { error: pinResult.error };

  const submitted = await submitApplication(
    tenant.id,
    session.customerId,
    draft.application.id,
    CREDITO_EFICAZ_TERMS_VERSION
  );
  if (!submitted.ok) return { error: submitted.error };

  revalidatePath(`/loja/${subdomain}/conta/credito-eficaz`);

  return { success: true as const };
}
