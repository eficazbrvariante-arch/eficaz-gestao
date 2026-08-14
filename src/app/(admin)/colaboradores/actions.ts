"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canEditCommission, canManageEmployeeLedger } from "@/lib/permissions";
import {
  createEmployeeLedgerEntry,
  settleEmployeeLedgerEntry,
} from "@/modules/employees/employee-ledger-service";
import { setDefaultCommissionPercent } from "@/modules/employees/commission-service";
import {
  createEmployeeLedgerEntrySchema,
  type CreateEmployeeLedgerEntryInput,
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
