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

export type CommissionProductOption = {
  id: string;
  name: string;
  salePrice: number;
  commissionEnabled: boolean;
};

/** Teto de itens carregados na lista de comissionados — controle visual, não paginação completa. */
const COMMISSIONED_LIST_LIMIT = 300;

/**
 * Todos os produtos ativos já marcados pra comissão — lista de controle
 * visual em Colaboradores, pra não depender só do contador "X de Y" nem de
 * buscar um por um pra saber quem já está marcado.
 */
export async function listCommissionedProductsAction(): Promise<CommissionProductOption[]> {
  const user = await requireUser();
  // Visualização, não edição — Gerente também vê a lista, só não mexe nela
  // (checkbox fica desabilitado no cliente pra quem não tem `canEditCommission`).
  if (!canManageEmployeeLedger(user.role)) return [];

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, active: true, commissionEnabled: true },
    select: { id: true, name: true, salePrice: true, commissionEnabled: true },
    orderBy: { name: "asc" },
    take: COMMISSIONED_LIST_LIMIT,
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    salePrice: Number(p.salePrice),
    commissionEnabled: p.commissionEnabled,
  }));
}

/**
 * Busca produto ativo pelo nome, pra marcar/desmarcar comissão individual
 * sem sair de Colaboradores — ver `ProdutosComissionadosBusca`.
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
  revalidatePath("/produtos");
  return { success: enabled ? "Produto comissionado." : "Comissão removida do produto." };
}
