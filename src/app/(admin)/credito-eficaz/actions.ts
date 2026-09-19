"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageCreditoEficaz } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/audit-service";
import { formatBRL } from "@/lib/format";
import {
  approveCreditoEficazApplicationSchema,
  rejectCreditoEficazApplicationSchema,
  requestCreditoEficazInfoSchema,
  setCreditoEficazLimitSchema,
  blockCreditoEficazSchema,
  registerCreditoEficazPaymentSchema,
  setCreditoEficazExposureLimitSchema,
  setCreditoEficazMaxInstallmentsSchema,
  setCreditoEficazSurchargePercentSchema,
  type SetCreditoEficazSurchargePercentInput,
  type ApproveCreditoEficazApplicationInput,
  type RejectCreditoEficazApplicationInput,
  type RequestCreditoEficazInfoInput,
  type SetCreditoEficazLimitInput,
  type BlockCreditoEficazInput,
  type RegisterCreditoEficazPaymentInput,
  convenioCreditPolicySchema,
  bulkCreditoEficazLimitSchema,
  creditoEficazCampaignSchema,
  type SetCreditoEficazExposureLimitFormValues,
  type SetCreditoEficazMaxInstallmentsInput,
  type ConvenioCreditPolicyFormValues,
  type BulkCreditoEficazLimitFormValues,
  type CreditoEficazCampaignInput,
} from "@/lib/validations/credito-eficaz";
import {
  approveApplication,
  rejectApplication,
  requestApplicationInfo,
  setCreditLimit,
  blockCustomerCredit,
  unblockCustomerCredit,
  adminResetCreditoEficazPin,
  registerManualPayment,
  setCreditoEficazExposureLimit,
  setCreditoEficazPaused,
  setCreditoEficazMaxInstallments,
  setCreditoEficazSurchargePercent,
} from "@/modules/credito-eficaz/credito-eficaz-service";
import {
  updateConvenioCreditPolicy,
  previewBulkLimitChange,
  applyBulkLimitChange,
  registerCampaignEntries,
} from "@/modules/credito-eficaz/convenio-credit-service";

const PERMISSION_ERROR = "Seu perfil não tem permissão para gerenciar o Crédito Eficaz.";

export async function approveApplicationAction(applicationId: string, input: ApproveCreditoEficazApplicationInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = approveCreditoEficazApplicationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const application = await prisma.creditoEficazApplication.findFirst({
    where: { id: applicationId, tenantId: user.tenantId },
    select: { customer: { select: { name: true } } },
  });

  const result = await approveApplication(
    user.tenantId,
    applicationId,
    user.id,
    parsed.data.limitAmount,
    parsed.data.note || null,
    parsed.data.wave || null
  );
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.approve",
    entity: "CreditoEficazApplication",
    entityId: applicationId,
    description: `Aprovou Crédito Eficaz de ${application?.customer.name ?? "cliente"} com limite de ${formatBRL(parsed.data.limitAmount)}.`,
  });

  revalidatePath("/credito-eficaz");
  return { success: "Solicitação aprovada." };
}

export async function rejectApplicationAction(applicationId: string, input: RejectCreditoEficazApplicationInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = rejectCreditoEficazApplicationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const application = await prisma.creditoEficazApplication.findFirst({
    where: { id: applicationId, tenantId: user.tenantId },
    select: { customer: { select: { name: true } } },
  });

  const result = await rejectApplication(user.tenantId, applicationId, user.id, parsed.data.reason);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.reject",
    entity: "CreditoEficazApplication",
    entityId: applicationId,
    description: `Recusou Crédito Eficaz de ${application?.customer.name ?? "cliente"}. Motivo: ${parsed.data.reason}`,
  });

  revalidatePath("/credito-eficaz");
  return { success: "Solicitação recusada." };
}

export async function requestApplicationInfoAction(
  applicationId: string,
  input: RequestCreditoEficazInfoInput
) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = requestCreditoEficazInfoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const application = await prisma.creditoEficazApplication.findFirst({
    where: { id: applicationId, tenantId: user.tenantId },
    select: { customer: { select: { name: true } } },
  });

  const result = await requestApplicationInfo(user.tenantId, applicationId, user.id, parsed.data.note);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.info_request",
    entity: "CreditoEficazApplication",
    entityId: applicationId,
    description: `Pediu mais informações no Crédito Eficaz de ${application?.customer.name ?? "cliente"}: ${parsed.data.note}`,
  });

  revalidatePath("/credito-eficaz");
  return { success: "Pedido de informação enviado ao cliente." };
}

export async function setCreditLimitAction(customerId: string, input: SetCreditoEficazLimitInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = setCreditoEficazLimitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId },
    select: { name: true },
  });

  const result = await setCreditLimit(user.tenantId, customerId, user.id, parsed.data.newLimit, parsed.data.note || null);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.limit_change",
    entity: "Customer",
    entityId: customerId,
    description: `Alterou o limite de Crédito Eficaz de ${customer?.name ?? "cliente"} para ${formatBRL(parsed.data.newLimit)}.`,
  });

  revalidatePath("/credito-eficaz");
  revalidatePath(`/clientes/${customerId}`);
  return { success: "Limite atualizado." };
}

export async function blockCreditoEficazAction(customerId: string, input: BlockCreditoEficazInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = blockCreditoEficazSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId },
    select: { name: true },
  });

  const result = await blockCustomerCredit(user.tenantId, customerId, parsed.data.reason);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.block",
    entity: "Customer",
    entityId: customerId,
    description: `Bloqueou o Crédito Eficaz de ${customer?.name ?? "cliente"}. Motivo: ${parsed.data.reason}`,
  });

  revalidatePath(`/clientes/${customerId}`);
  return { success: "Crédito Eficaz bloqueado." };
}

export async function unblockCreditoEficazAction(customerId: string) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId },
    select: { name: true },
  });

  const result = await unblockCustomerCredit(user.tenantId, customerId);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.unblock",
    entity: "Customer",
    entityId: customerId,
    description: `Desbloqueou o Crédito Eficaz de ${customer?.name ?? "cliente"}.`,
  });

  revalidatePath(`/clientes/${customerId}`);
  return { success: "Crédito Eficaz desbloqueado." };
}

export async function resetCreditoEficazPinAction(customerId: string, newPin: string) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId },
    select: { name: true },
  });

  const result = await adminResetCreditoEficazPin(user.tenantId, customerId, newPin);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.pin_reset",
    entity: "Customer",
    entityId: customerId,
    description: `Redefiniu o PIN de Crédito Eficaz de ${customer?.name ?? "cliente"}.`,
  });

  revalidatePath(`/clientes/${customerId}`);
  return { success: "PIN redefinido." };
}

export async function registerCreditoEficazPaymentAction(
  customerId: string,
  input: RegisterCreditoEficazPaymentInput
) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = registerCreditoEficazPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const result = await registerManualPayment(
    user.tenantId,
    parsed.data.usageId,
    user.id,
    parsed.data.amount,
    new Date(`${parsed.data.paidAt}T12:00:00-03:00`),
    parsed.data.method
  );
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.payment",
    entity: "CreditoEficazUsage",
    entityId: parsed.data.usageId,
    description: `Registrou pagamento de ${formatBRL(parsed.data.amount)} (${parsed.data.method}) no Crédito Eficaz.`,
  });

  revalidatePath(`/clientes/${customerId}`);
  return { success: "Pagamento registrado." };
}

export async function setCreditoEficazExposureLimitAction(input: SetCreditoEficazExposureLimitFormValues) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = setCreditoEficazExposureLimitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const result = await setCreditoEficazExposureLimit(user.tenantId, parsed.data.limit);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.exposure_limit_change",
    entity: "Tenant",
    entityId: user.tenantId,
    description:
      parsed.data.limit == null
        ? "Removeu o teto global do Crédito Eficaz (sem teto configurado)."
        : `Definiu o teto global do Crédito Eficaz em ${formatBRL(parsed.data.limit)}.`,
  });

  revalidatePath("/credito-eficaz");
  return { success: "Teto global atualizado." };
}

export async function setCreditoEficazPausedAction(paused: boolean) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const result = await setCreditoEficazPaused(user.tenantId, paused);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.pause_toggle",
    entity: "Tenant",
    entityId: user.tenantId,
    description: `${paused ? "Pausou" : "Despausou"} novas utilizações do Crédito Eficaz.`,
  });

  revalidatePath("/credito-eficaz");
  revalidatePath("/pdv");
  return { success: paused ? "Crédito Eficaz pausado." : "Crédito Eficaz despausado." };
}

export async function setCreditoEficazMaxInstallmentsAction(input: SetCreditoEficazMaxInstallmentsInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = setCreditoEficazMaxInstallmentsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const result = await setCreditoEficazMaxInstallments(user.tenantId, parsed.data.maxInstallments);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.max_installments_change",
    entity: "Tenant",
    entityId: user.tenantId,
    description: `Definiu o máximo de ${parsed.data.maxInstallments} parcela(s) pro financiamento de OS com Crédito Eficaz.`,
  });

  revalidatePath("/credito-eficaz");
  return { success: "Configuração de parcelas atualizada." };
}

export async function setCreditoEficazSurchargePercentAction(input: SetCreditoEficazSurchargePercentInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = setCreditoEficazSurchargePercentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const result = await setCreditoEficazSurchargePercent(user.tenantId, parsed.data.percent);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.surcharge_change",
    entity: "Tenant",
    entityId: user.tenantId,
    description: `Definiu o acréscimo de ${parsed.data.percent.toLocaleString("pt-BR")}% sobre compras no Crédito Eficaz.`,
  });

  revalidatePath("/credito-eficaz");
  revalidatePath("/pdv");
  return { success: "Acréscimo do Crédito Eficaz atualizado." };
}

// ---------------------------------------------------------------------------
// Crédito automático por convênio
// ---------------------------------------------------------------------------

/**
 * Salva a configuração e, quando a chave vira ONLINE, aplica a concessão
 * inicial a quem já está aprovado — o resultado devolve quantos receberam,
 * pro Admin ver o efeito na hora em vez de descobrir depois.
 */
export async function updateConvenioCreditPolicyAction(
  convenioId: string,
  input: ConvenioCreditPolicyFormValues
) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = convenioCreditPolicySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const convenio = await prisma.convenio.findFirst({
    where: { id: convenioId, tenantId: user.tenantId },
    select: { name: true, creditPolicy: { select: { enabled: true } } },
  });
  if (!convenio) return { error: "Convênio não encontrado." };
  const wasEnabled = convenio.creditPolicy?.enabled ?? false;

  const result = await updateConvenioCreditPolicy(user.tenantId, convenioId, user.id, parsed.data);
  if (!result.ok) return { error: result.error };

  const nowEnabled = parsed.data.enabled ?? wasEnabled;
  const stateChange =
    nowEnabled === wasEnabled ? "Ajustou os parâmetros do" : nowEnabled ? "Ligou (ONLINE) o" : "Desligou (OFFLINE) o";

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.convenio_policy_change",
    entity: "Convenio",
    entityId: convenioId,
    description: `${stateChange} crédito automático do convênio ${convenio.name}.${
      result.granted > 0 ? ` ${result.granted} cliente(s) receberam limite automático.` : ""
    }`,
  });

  revalidatePath("/credito-eficaz");
  revalidatePath(`/convenios/${convenioId}`);

  if (!nowEnabled) {
    return {
      success:
        "Crédito automático OFFLINE. Nenhum limite ou dívida existente foi alterado — só não haverá novas concessões.",
    };
  }
  return {
    success:
      result.granted > 0
        ? `Crédito automático ONLINE. ${result.granted} cliente(s) receberam o limite inicial.`
        : "Crédito automático ONLINE. Nenhum cliente novo a receber agora (quem já tinha limite não é alterado).",
  };
}

/** Só leitura — é o que a tela mostra ANTES de o Admin confirmar a alteração em massa. */
export async function previewBulkCreditoEficazLimitAction(input: BulkCreditoEficazLimitFormValues) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = bulkCreditoEficazLimitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const target = parsed.data.convenioId
    ? ({ kind: "CONVENIO", convenioId: parsed.data.convenioId } as const)
    : ({ kind: "CUSTOMERS", customerIds: parsed.data.customerIds ?? [] } as const);

  const preview = await previewBulkLimitChange(user.tenantId, target, parsed.data.newLimit);
  return { preview };
}

export async function applyBulkCreditoEficazLimitAction(input: BulkCreditoEficazLimitFormValues) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = bulkCreditoEficazLimitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const target = parsed.data.convenioId
    ? ({ kind: "CONVENIO", convenioId: parsed.data.convenioId } as const)
    : ({ kind: "CUSTOMERS", customerIds: parsed.data.customerIds ?? [] } as const);

  const result = await applyBulkLimitChange(
    user.tenantId,
    user.id,
    target,
    parsed.data.newLimit,
    parsed.data.note || null
  );
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.bulk_limit_change",
    entity: parsed.data.convenioId ? "Convenio" : "Customer",
    entityId: parsed.data.convenioId ?? "varios",
    description: `Alterou em massa o limite de ${result.changed} cliente(s) para ${formatBRL(parsed.data.newLimit)}.`,
  });

  revalidatePath("/credito-eficaz");
  return { success: `Limite alterado em ${result.changed} cliente(s).` };
}

/**
 * Apuração da campanha de pontualidade. Só roda por clique do Admin e só
 * com a campanha habilitada no convênio — não existe execução automática
 * nem sorteio: isto apenas registra quem cumpriu os critérios.
 */
export async function runCreditoEficazCampaignAction(input: CreditoEficazCampaignInput) {
  const user = await requireUser();
  if (!canManageCreditoEficaz(user.role)) return { error: PERMISSION_ERROR };

  const parsed = creditoEficazCampaignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };

  const result = await registerCampaignEntries(user.tenantId, parsed.data.convenioId, parsed.data.referenceMonth);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? "Usuário",
    action: "credito_eficaz.campaign_apuracao",
    entity: "CreditoEficazCampaign",
    entityId: result.campaignId,
    description: `Apurou a campanha de pontualidade de ${parsed.data.referenceMonth}: ${result.entries} participante(s) elegíveis.`,
  });

  revalidatePath("/credito-eficaz");
  return { success: `${result.entries} participante(s) registrados na campanha de ${parsed.data.referenceMonth}.` };
}
