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
  type ApproveCreditoEficazApplicationInput,
  type RejectCreditoEficazApplicationInput,
  type RequestCreditoEficazInfoInput,
  type SetCreditoEficazLimitInput,
  type BlockCreditoEficazInput,
  type RegisterCreditoEficazPaymentInput,
  type SetCreditoEficazExposureLimitFormValues,
  type SetCreditoEficazMaxInstallmentsInput,
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
} from "@/modules/credito-eficaz/credito-eficaz-service";

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
