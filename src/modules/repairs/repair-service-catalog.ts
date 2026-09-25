import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RepairServiceInput } from "@/lib/validations/repair-order";

/** Serviço como aparece na busca. `costPrice`/`supplier` só vêm preenchidos
 *  quando quem chamou pode ver custo (ver `canManageRepairServiceCatalog`). */
export type RepairServiceOption = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  costPrice: number | null;
  supplier: { id: string; name: string } | null;
};

export type RepairServiceResult =
  | { ok: true; service: RepairServiceOption }
  | { ok: false; error: string };

const SELECT = {
  id: true,
  name: true,
  price: true,
  active: true,
  costPrice: true,
  supplier: { select: { id: true, name: true } },
} as const;

type RawService = Prisma.RepairServiceGetPayload<{ select: typeof SELECT }>;

function toOption(raw: RawService, withCost: boolean): RepairServiceOption {
  return {
    id: raw.id,
    name: raw.name,
    price: Number(raw.price),
    active: raw.active,
    costPrice: withCost && raw.costPrice !== null ? Number(raw.costPrice) : null,
    supplier: withCost ? raw.supplier : null,
  };
}

export async function searchRepairServices(
  tenantId: string,
  term: string,
  options: { withCost: boolean; includeInactive?: boolean; take?: number }
): Promise<RepairServiceOption[]> {
  const q = term.trim();
  const services = await prisma.repairService.findMany({
    where: {
      tenantId,
      ...(options.includeInactive ? {} : { active: true }),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: options.take ?? 20,
  });
  return services.map((s) => toOption(s, options.withCost));
}

/** O fornecedor tem de ser deste tenant — nunca confia só no id que veio do formulário. */
async function resolveSupplierId(tenantId: string, supplierId: string | undefined) {
  if (!supplierId) return { ok: true as const, id: null };
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { id: true },
  });
  if (!supplier) return { ok: false as const };
  return { ok: true as const, id: supplier.id };
}

async function nameTaken(tenantId: string, name: string, exceptId?: string) {
  const existing = await prisma.repairService.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { active: true },
  });
  if (!existing) return null;
  return existing.active
    ? "Já existe um serviço com esse nome."
    : "Já existe um serviço desativado com esse nome — reative-o na tela de Serviços.";
}

export async function createRepairService(
  tenantId: string,
  input: RepairServiceInput,
  options: { canSetCost: boolean }
): Promise<RepairServiceResult> {
  const taken = await nameTaken(tenantId, input.name);
  if (taken) return { ok: false, error: taken };

  let supplierId: string | null = null;
  if (options.canSetCost) {
    const supplier = await resolveSupplierId(tenantId, input.supplierId || undefined);
    if (!supplier.ok) return { ok: false, error: "Fornecedor não encontrado." };
    supplierId = supplier.id;
  }

  try {
    const created = await prisma.repairService.create({
      data: {
        tenantId,
        name: input.name,
        price: input.price,
        // Quem não pode ver custo nunca grava custo/fornecedor, mesmo
        // chamando a action direto com esses campos preenchidos.
        costPrice: options.canSetCost ? (input.costPrice ?? null) : null,
        supplierId,
      },
      select: SELECT,
    });
    return { ok: true, service: toOption(created, options.canSetCost) };
  } catch {
    return { ok: false, error: "Não foi possível registrar o serviço. Tente novamente." };
  }
}

/** Só administrador (ver `canManageRepairServiceCatalog`) — conferido na action. */
export async function updateRepairService(
  tenantId: string,
  id: string,
  input: RepairServiceInput
): Promise<RepairServiceResult> {
  const existing = await prisma.repairService.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Serviço não encontrado." };

  const taken = await nameTaken(tenantId, input.name, id);
  if (taken) return { ok: false, error: taken };

  const supplier = await resolveSupplierId(tenantId, input.supplierId || undefined);
  if (!supplier.ok) return { ok: false, error: "Fornecedor não encontrado." };

  try {
    const updated = await prisma.repairService.update({
      where: { id },
      data: {
        name: input.name,
        price: input.price,
        costPrice: input.costPrice ?? null,
        supplierId: supplier.id,
      },
      select: SELECT,
    });
    return { ok: true, service: toOption(updated, true) };
  } catch {
    return { ok: false, error: "Não foi possível salvar o serviço. Tente novamente." };
  }
}

export async function setRepairServiceActive(
  tenantId: string,
  id: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await prisma.repairService.updateMany({
    where: { id, tenantId },
    data: { active },
  });
  if (result.count === 0) return { ok: false, error: "Serviço não encontrado." };
  return { ok: true };
}

type ItemCostInput = { repairServiceId?: string | null };
type PreviousItem = { repairServiceId: string | null; unitCost: Prisma.Decimal | null };

/**
 * Para cada linha da OS, devolve o serviço do catálogo validado (deste
 * tenant) e o custo unitário a gravar. Linha que já estava na OS com o mesmo
 * serviço mantém o custo congelado de antes — a edição recria as linhas
 * (ver `updateRepairOrder`), e sem isso uma mudança de custo no catálogo
 * reescreveria o custo de OS antigas. Linha nova pega o custo atual do
 * catálogo. O custo nunca vem do formulário.
 */
export async function resolveRepairItemCosts(
  tenantId: string,
  items: ItemCostInput[],
  previous: PreviousItem[] = []
): Promise<{ repairServiceId: string | null; unitCost: number | null }[]> {
  const ids = [...new Set(items.map((i) => i.repairServiceId).filter((id): id is string => !!id))];
  const catalog = ids.length
    ? await prisma.repairService.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, costPrice: true },
      })
    : [];
  const catalogCost = new Map(catalog.map((s) => [s.id, s.costPrice]));

  // Custos já congelados nesta OS, por serviço — consumidos um a um para que
  // duas linhas do mesmo serviço reaproveitem cada uma o seu.
  const frozen = new Map<string, (number | null)[]>();
  for (const item of previous) {
    if (!item.repairServiceId) continue;
    const list = frozen.get(item.repairServiceId) ?? [];
    list.push(item.unitCost === null ? null : Number(item.unitCost));
    frozen.set(item.repairServiceId, list);
  }

  return items.map((item) => {
    const id = item.repairServiceId || null;
    if (!id || !catalogCost.has(id)) return { repairServiceId: null, unitCost: null };
    const kept = frozen.get(id);
    if (kept && kept.length > 0) return { repairServiceId: id, unitCost: kept.shift() ?? null };
    const cost = catalogCost.get(id);
    return { repairServiceId: id, unitCost: cost === null || cost === undefined ? null : Number(cost) };
  });
}

/** Custo total da OS: custo da peça (digitado) + custo dos serviços do catálogo. */
export function repairOrderTotalCost(
  costPrice: { toString(): string } | number | null,
  items: { unitCost: { toString(): string } | number | null; quantity: number }[]
) {
  const services = items.reduce(
    (sum, item) => sum + (item.unitCost === null ? 0 : Number(item.unitCost) * item.quantity),
    0
  );
  return Math.round((Number(costPrice ?? 0) + services) * 100) / 100;
}
