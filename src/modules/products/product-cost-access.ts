import { prisma } from "@/lib/prisma";
import { canEnterProductCostOnCreate, canViewProductCost } from "@/lib/permissions";
import type { UserRole } from "@/generated/prisma/enums";

export type ProductCostAccess = {
  /** Vê e altera o custo de produto já salvo (e exporta com custo). */
  canView: boolean;
  /** Pode digitar o custo ao cadastrar produto novo. */
  canEnterOnCreate: boolean;
};

/**
 * As duas travas do custo de produto pro usuário logado. A do Gerente depende
 * de um campo do cadastro dele (`User.canEnterProductCost`, ligado pelo Admin
 * conforme quem está de plantão) — por isso consulta o banco, não só o papel.
 */
export async function getProductCostAccess(user: { id: string; role: UserRole }): Promise<ProductCostAccess> {
  if (canViewProductCost(user.role)) return { canView: true, canEnterOnCreate: true };
  if (user.role !== "MANAGER") return { canView: false, canEnterOnCreate: false };
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { canEnterProductCost: true },
  });
  return {
    canView: false,
    canEnterOnCreate: canEnterProductCostOnCreate(user.role, row?.canEnterProductCost ?? false),
  };
}
