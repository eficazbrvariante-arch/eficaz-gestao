"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canEditCommission, canManageEmployeeLedger } from "@/lib/permissions";
import { recordAudit } from "@/modules/audit/audit-service";
import {
  createEmployeeLedgerEntry,
  deleteEmployeeLedgerEntry,
  settleEmployeeLedgerEntry,
  revertEmployeeLedgerEntryToPending,
} from "@/modules/employees/employee-ledger-service";
import { EMPLOYEE_LEDGER_TYPE_LABELS } from "@/lib/validations/employee-ledger";
import { formatBRL } from "@/lib/format";
import { setDefaultCommissionPercent } from "@/modules/employees/commission-service";
import { setHourlyRate, registerHourlyPayment } from "@/modules/employees/hourly-payment-service";
import {
  createEmployeeLedgerEntrySchema,
  setHourlyRateSchema,
  registerHourlyPaymentSchema,
  type CreateEmployeeLedgerEntryInput,
  type SetHourlyRateInput,
  type RegisterHourlyPaymentInput,
} from "@/lib/validations/employee-ledger";

export type EmployeeOption = { id: string; name: string };

/** Colaboradores ativos do tenant, qualquer papel — não só quem vende. */
export async function listEmployeesAction(): Promise<EmployeeOption[]> {
  const user = await requireUser();
  return prisma.user.findMany({
    where: { tenantId: user.tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createEmployeeLedgerEntryAction(input: CreateEmployeeLedgerEntryInput) {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar lançamentos de colaboradores." };
  }

  const parsed = createEmployeeLedgerEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await createEmployeeLedgerEntry(
    { tenantId: user.tenantId, createdById: user.id },
    parsed.data
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/colaboradores");
  return { success: "Lançamento registrado." };
}

export async function settleEmployeeLedgerEntryAction(id: string) {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return { error: "Seu perfil não tem permissão para quitar lançamentos de colaboradores." };
  }

  const result = await settleEmployeeLedgerEntry(user.tenantId, id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/colaboradores");
  return { success: "Lançamento quitado." };
}

/**
 * Corrige um "Marcar como pago" (ou confirmação por selfie no Ponto) feito
 * por engano — ex.: Adiantamento/Mercadoria que o colaborador só confirmou
 * ter levado, mas o sistema fechou como se a dívida já tivesse sido quitada.
 */
export async function revertEmployeeLedgerEntryToPendingAction(id: string) {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar lançamentos de colaboradores." };
  }

  const result = await revertEmployeeLedgerEntryToPending(user.tenantId, id);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "employee_ledger.revert_to_pending",
    entity: "EmployeeLedgerEntry",
    entityId: id,
    description: "Reverteu lançamento de pago para pendente (correção de quitação por engano).",
  });

  revalidatePath("/colaboradores");
  return { success: "Lançamento voltou a ficar pendente." };
}

export async function deleteEmployeeLedgerEntryAction(id: string) {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return { error: "Seu perfil não tem permissão para excluir lançamentos de colaboradores." };
  }

  const result = await deleteEmployeeLedgerEntry(user.tenantId, id);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "employee_ledger.delete",
    entity: "EmployeeLedgerEntry",
    entityId: id,
    description: `Excluiu lançamento de ${result.userName} — ${EMPLOYEE_LEDGER_TYPE_LABELS[result.type as keyof typeof EMPLOYEE_LEDGER_TYPE_LABELS]} de ${formatBRL(result.amount)}.`,
  });

  revalidatePath("/colaboradores");
  return { success: "Lançamento excluído." };
}

export async function setDefaultCommissionPercentAction(percent: number) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar a comissão." };
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { error: "Informe um percentual entre 0 e 100." };
  }

  await setDefaultCommissionPercent(user.tenantId, percent);
  revalidatePath("/colaboradores");
  return { success: "Comissão geral atualizada." };
}

/**
 * Liga/desliga a comissão geral em todos os produtos ativos de uma vez —
 * atalho pra quem quer que a comissão geral valha pro catálogo inteiro, sem
 * precisar marcar produto por produto em Produtos (percentual individual
 * continua sendo exceção, ajustada depois na edição de cada produto).
 */
export async function setAllProductsCommissionEnabledAction(enabled: boolean) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar comissão." };
  }

  const result = await prisma.product.updateMany({
    where: { tenantId: user.tenantId, active: true },
    data: { commissionEnabled: enabled },
  });

  revalidatePath("/colaboradores");
  revalidatePath("/produtos");
  return {
    success: enabled
      ? `${result.count} produto(s) marcado(s) como comissionado(s).`
      : `Comissão removida de ${result.count} produto(s).`,
  };
}

export type CommissionProductOption = {
  id: string;
  name: string;
  salePrice: number;
  commissionEnabled: boolean;
};

/**
 * Busca produto ativo pelo nome, pra marcar/desmarcar comissão individual —
 * ver `ProdutosComissionadosPicker`.
 */
export async function searchCommissionProductsAction(
  query: string
): Promise<CommissionProductOption[]> {
  const user = await requireUser();
  if (!canEditCommission(user.role)) return [];
  const term = query.trim();
  if (term.length < 2) return [];

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, active: true, name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true, salePrice: true, commissionEnabled: true },
    orderBy: { name: "asc" },
    take: 20,
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    salePrice: Number(p.salePrice),
    commissionEnabled: p.commissionEnabled,
  }));
}

/** Liga/desliga a comissão de um único produto — usado pela busca acima. */
export async function setProductCommissionEnabledAction(productId: string, enabled: boolean) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar comissão." };
  }

  const result = await prisma.product.updateMany({
    where: { id: productId, tenantId: user.tenantId },
    data: { commissionEnabled: enabled },
  });
  if (result.count === 0) return { error: "Produto não encontrado." };

  revalidatePath("/colaboradores");
  revalidatePath("/colaboradores/produtos-comissionados");
  revalidatePath("/produtos");
  return { success: enabled ? "Produto comissionado." : "Comissão removida do produto." };
}

/**
 * Desliga a comissão de vários produtos de uma vez — usado na página
 * "Produtos comissionados" (revisão em lote: desmarca vários, clica Salvar).
 */
export async function bulkRemoveProductCommissionAction(productIds: string[]) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar comissão." };
  }
  if (productIds.length === 0) return { success: "Nenhuma alteração." };

  const result = await prisma.product.updateMany({
    where: { id: { in: productIds }, tenantId: user.tenantId },
    data: { commissionEnabled: false },
  });

  revalidatePath("/colaboradores");
  revalidatePath("/colaboradores/produtos-comissionados");
  revalidatePath("/produtos");
  return { success: `Comissão removida de ${result.count} produto(s).` };
}

/**
 * Valor pago por hora — mesma trava de `canEditCommission` (só ADMIN decide
 * quanto cada colaborador ganha), diferente do restante do painel de
 * Colaboradores, que Gerente também opera.
 */
export async function setHourlyRateAction(input: SetHourlyRateInput) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar o valor por hora." };
  }

  const parsed = setHourlyRateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const found = await setHourlyRate(user.tenantId, parsed.data.userId, parsed.data.hourlyRate);
  if (!found) return { error: "Colaborador não encontrado." };

  revalidatePath("/colaboradores");
  revalidatePath(`/colaboradores/${parsed.data.userId}/horas`);
  return { success: "Valor por hora atualizado." };
}

/**
 * Registra o pagamento por horas do período como lançamento — o valor nunca
 * vem do formulário, é recalculado aqui dentro a partir do Ponto (ver
 * `registerHourlyPayment`).
 */
export async function registerHourlyPaymentAction(input: RegisterHourlyPaymentInput) {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return { error: "Seu perfil não tem permissão para registrar pagamentos de colaboradores." };
  }

  const parsed = registerHourlyPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await registerHourlyPayment(
    { tenantId: user.tenantId, createdById: user.id },
    parsed.data
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/colaboradores");
  revalidatePath(`/colaboradores/${parsed.data.userId}/horas`);
  return { success: `Pagamento de ${result.amount.toFixed(2)} registrado.` };
}
