/**
 * Remove os dois tenants de QA criados por `qa-multitenant-seed.mts`
 * (Etapa B da Auditoria Mestra), sem tocar em nenhum outro dado do banco.
 * Filtra estritamente pelos dois subdomínios conhecidos.
 *
 * Uso: npx tsx scripts/qa-multitenant-cleanup.mts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SUBDOMAINS = ["qa-loja-teste-a", "qa-loja-teste-b"];

async function wipeTenant(subdomain: string) {
  const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) {
    console.log(`Tenant ${subdomain}: já não existe.`);
    return;
  }
  const where = { tenantId: tenant.id };
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { sale: where } }),
    prisma.saleItemDefectPhoto.deleteMany({ where: { saleItemDefect: where } }),
    prisma.saleItemDefect.deleteMany({ where }),
    prisma.saleItem.deleteMany({ where: { sale: where } }),
    prisma.customerCreditMovement.deleteMany({ where }),
    prisma.fiadoEntry.deleteMany({ where }),
    prisma.convenioRedemption.deleteMany({ where }),
    prisma.sale.deleteMany({ where }),
    prisma.orderItem.deleteMany({ where: { order: where } }),
    prisma.order.deleteMany({ where }),
    prisma.stockMovement.deleteMany({ where }),
    prisma.cashMovement.deleteMany({ where }),
    prisma.cashRegister.deleteMany({ where }),
    prisma.repairOrderPayment.deleteMany({ where }),
    prisma.repairOrderPhoto.deleteMany({ where: { repairOrder: where } }),
    prisma.repairOrderEvent.deleteMany({ where: { repairOrder: where } }),
    prisma.repairOrderItem.deleteMany({ where: { repairOrder: where } }),
    prisma.repairOrder.deleteMany({ where }),
    prisma.employeeLedgerEntry.deleteMany({ where }),
    prisma.convenioMember.deleteMany({ where }),
    prisma.convenioInvite.deleteMany({ where }),
    prisma.convenioProductDiscount.deleteMany({ where }),
    prisma.convenio.deleteMany({ where }),
    prisma.productImage.deleteMany({ where: { product: where } }),
    prisma.productVariant.deleteMany({ where: { product: where } }),
    prisma.productReview.deleteMany({ where }),
    prisma.productPriceHistory.deleteMany({ where }),
    prisma.product.deleteMany({ where }),
    prisma.customerSession.deleteMany({ where }),
    prisma.customer.deleteMany({ where }),
    prisma.category.deleteMany({ where }),
    prisma.brand.deleteMany({ where }),
    prisma.supplier.deleteMany({ where }),
    prisma.deliveryZone.deleteMany({ where }),
    prisma.auditLog.deleteMany({ where }),
    prisma.device.deleteMany({ where }),
    prisma.user.deleteMany({ where }),
  ]);
  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log(`Tenant ${subdomain}: removido.`);
}

for (const subdomain of SUBDOMAINS) {
  await wipeTenant(subdomain);
}

console.log("\nLimpeza de QA multi-tenant concluída.");
await prisma.$disconnect();
await pool.end();
