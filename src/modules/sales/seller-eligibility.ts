import { canSell } from "@/lib/permissions";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Se um usuário pode ser o vendedor de uma venda. Extraída de `createSaleAction`
 * para ser testável sem Prisma — a Action relê o usuário no banco e passa o
 * resultado aqui antes de confiar no `sellerId` recebido do cliente.
 */
export function isSellerAssignable(
  seller: { tenantId: string; active: boolean; role: UserRole } | null,
  requestTenantId: string
): boolean {
  if (!seller) return false;
  if (seller.tenantId !== requestTenantId) return false;
  if (!seller.active) return false;
  return canSell(seller.role);
}
