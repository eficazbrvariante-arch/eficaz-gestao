import { prisma } from "@/lib/prisma";

/**
 * Carrega os dois tenants de QA da Etapa B (Auditoria Mestra) já criados pelo
 * script `scripts/qa-multitenant-seed.mts`. Os testes de integração NÃO
 * recriam os dados sozinhos — rode `npm run qa:multitenant:seed` antes de
 * `npm run test:integration`.
 */
export const SUBDOMAIN_A = "qa-loja-teste-a";
export const SUBDOMAIN_B = "qa-loja-teste-b";

export async function loadQaTenant(subdomain: string) {
  const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) {
    throw new Error(
      `Tenant de QA "${subdomain}" não encontrado. Rode "npm run qa:multitenant:seed" antes dos testes de integração.`
    );
  }

  const [admin, seller, customer, productNormal, productLastUnit, cashRegister, sale, order, repairOrder, convenio, convenioMember] =
    await Promise.all([
      prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "ADMIN" } }),
      prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "SELLER" } }),
      prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.product.findFirstOrThrow({ where: { tenantId: tenant.id, internalCode: { startsWith: "QA-NORMAL-" } } }),
      prisma.product.findFirstOrThrow({ where: { tenantId: tenant.id, internalCode: { startsWith: "QA-LASTUNIT-" } } }),
      prisma.cashRegister.findFirstOrThrow({ where: { tenantId: tenant.id, status: "OPEN" } }),
      prisma.sale.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.order.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.repairOrder.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.convenio.findFirstOrThrow({ where: { tenantId: tenant.id } }),
      prisma.convenioMember.findFirstOrThrow({ where: { tenantId: tenant.id } }),
    ]);

  return {
    tenant,
    admin,
    seller,
    customer,
    productNormal,
    productLastUnit,
    cashRegister,
    sale,
    order,
    repairOrder,
    convenio,
    convenioMember,
  };
}

export async function resetLastUnitStock(productId: string, qty = 1) {
  await prisma.product.update({ where: { id: productId }, data: { stockQty: qty } });
}
