"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageRepairOrders, canManageRepairServiceCatalog } from "@/lib/permissions";
import { recordAudit } from "@/modules/audit/audit-service";
import { repairServiceSchema, type RepairServiceInput } from "@/lib/validations/repair-order";
import {
  createRepairService,
  searchRepairServices,
  setRepairServiceActive,
  updateRepairService,
  type RepairServiceOption,
} from "@/modules/repairs/repair-service-catalog";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Busca usada dentro da OS — só serviços ativos. Custo só volta para o Admin. */
export async function searchRepairServicesAction(term: string): Promise<RepairServiceOption[]> {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) return [];
  return searchRepairServices(user.tenantId, term, {
    withCost: canManageRepairServiceCatalog(user.role),
    take: 10,
  });
}

/** Fornecedores para o cadastro rápido — só quem pode gravar custo/fornecedor. */
export async function listRepairServiceSuppliersAction(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  if (!canManageRepairServiceCatalog(user.role)) return [];
  return prisma.supplier.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createRepairServiceAction(
  input: RepairServiceInput
): Promise<{ error: string } | { service: RepairServiceOption }> {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return { error: "Seu perfil não tem permissão para cadastrar serviços." };
  }

  const parsed = repairServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await createRepairService(user.tenantId, parsed.data, {
    canSetCost: canManageRepairServiceCatalog(user.role),
  });
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "repair.service_create",
    entity: "RepairService",
    entityId: result.service.id,
    description: `Cadastrou o serviço "${result.service.name}" (${formatBRL(result.service.price)}).`,
  });

  revalidatePath("/assistencia-tecnica/servicos");
  return { service: result.service };
}

export async function updateRepairServiceAction(
  id: string,
  input: RepairServiceInput
): Promise<{ error: string } | { success: string }> {
  const user = await requireUser();
  if (!canManageRepairServiceCatalog(user.role)) {
    return { error: "Só o administrador pode editar serviços." };
  }

  const parsed = repairServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await updateRepairService(user.tenantId, id, parsed.data);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "repair.service_edit",
    entity: "RepairService",
    entityId: id,
    description: `Editou o serviço "${result.service.name}" (${formatBRL(result.service.price)}).`,
  });

  revalidatePath("/assistencia-tecnica/servicos");
  return { success: "Serviço salvo." };
}

export async function setRepairServiceActiveAction(
  id: string,
  active: boolean
): Promise<{ error: string } | { success: string }> {
  const user = await requireUser();
  if (!canManageRepairServiceCatalog(user.role)) {
    return { error: "Só o administrador pode ativar ou desativar serviços." };
  }

  const result = await setRepairServiceActive(user.tenantId, id, active);
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: active ? "repair.service_reactivate" : "repair.service_deactivate",
    entity: "RepairService",
    entityId: id,
    description: active ? "Reativou um serviço da assistência." : "Desativou um serviço da assistência.",
  });

  revalidatePath("/assistencia-tecnica/servicos");
  return { success: active ? "Serviço reativado." : "Serviço desativado." };
}
