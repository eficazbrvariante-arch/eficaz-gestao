/**
 * Cria dois tenants de QA completos (Tenant A / Tenant B) para a Etapa B da
 * Auditoria Mestra — testes automatizados reais de isolamento multi-tenant e
 * concorrência de estoque, rodando contra o banco `dev-local` (Neon), nunca
 * produção.
 *
 * Idempotente: remove qualquer resquício dos dois tenants de QA (pelo
 * subdomínio único) antes de recriar.
 *
 * Uso: npx tsx scripts/qa-multitenant-seed.mts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import crypto from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { computeCatalogPrice } from "../src/modules/products/catalog-price.js";
import { createSale } from "../src/modules/sales/sale-service.js";
import { createOrder } from "../src/modules/orders/order-service.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SUBDOMAIN_A = "qa-loja-teste-a";
const SUBDOMAIN_B = "qa-loja-teste-b";

async function wipeTenant(subdomain: string) {
  const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) return;
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
}

async function seedTenant(opts: {
  subdomain: string;
  name: string;
  stockPolicy: "RESERVE" | "DEDUCT";
}) {
  const tenant = await prisma.tenant.create({
    data: {
      name: opts.name,
      tradeName: opts.name,
      document: crypto.randomUUID().slice(0, 14),
      phone: "(47) 3000-0000",
      subdomain: opts.subdomain,
      email: `admin@${opts.subdomain}.qa.test`,
      catalogEnabled: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      stockPolicy: opts.stockPolicy,
    },
  });

  const passwordHash = await bcrypt.hash("QaTeste@2026", 10);
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: `Admin ${opts.name}`,
      email: `admin@${opts.subdomain}.qa.test`,
      passwordHash,
      role: "ADMIN",
    },
  });
  const seller = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: `Vendedor ${opts.name}`,
      email: `seller@${opts.subdomain}.qa.test`,
      passwordHash,
      role: "SELLER",
    },
  });

  const category = await prisma.category.create({
    data: { tenantId: tenant.id, name: "Categoria QA" },
  });
  const supplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "Fornecedor QA", phone: "(11) 3000-0000" },
  });

  const productNormal = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: `Produto QA Normal ${opts.subdomain}`,
      internalCode: `QA-NORMAL-${opts.subdomain}`,
      barcode: `QA${opts.subdomain}0001`,
      categoryId: category.id,
      supplierId: supplier.id,
      costPrice: 10,
      salePrice: 50,
      catalogPrice: computeCatalogPrice(50, null),
      stockQty: 100,
      minStock: 5,
      active: true,
      showInCatalog: true,
    },
  });

  // Produto dedicado ao teste de concorrência — SEMPRE recriado com
  // stockQty = 1 antes de cada rodada de teste (ver script de teste).
  const productLastUnit = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: `Produto QA Última Unidade ${opts.subdomain}`,
      internalCode: `QA-LASTUNIT-${opts.subdomain}`,
      barcode: `QA${opts.subdomain}0002`,
      categoryId: category.id,
      supplierId: supplier.id,
      costPrice: 20,
      salePrice: 100,
      catalogPrice: computeCatalogPrice(100, null),
      stockQty: 1,
      minStock: 0,
      active: true,
      showInCatalog: true,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: `Cliente QA ${opts.subdomain}`,
      document: crypto.randomUUID().slice(0, 11),
      phone: "(47) 98888-0000",
    },
  });

  const cashRegister = await prisma.cashRegister.create({
    data: { tenantId: tenant.id, openedById: admin.id, openingAmount: 200 },
  });

  const saleResult = await createSale(
    {
      tenantId: tenant.id,
      sellerId: seller.id,
      cashRegisterId: cashRegister.id,
      allowDiscount: true,
      allowFreeDiscount: true,
      allowFiado: true,
      operatorId: admin.id,
    },
    {
      sellerId: seller.id,
      customerId: customer.id,
      items: [{ productId: productNormal.id, variantId: "", quantity: 1, discount: 0 }],
      payments: [{ method: "CASH", amount: 50 }],
      cashReceived: 50,
    } as never
  );
  if (!saleResult.ok) throw new Error(`Falha ao criar venda QA (${opts.subdomain}): ${saleResult.error}`);

  const orderResult = await createOrder(
    tenant.id,
    {
      customerName: customer.name,
      customerPhone: "(47) 98888-0000",
      customerEmail: "",
      customerDocument: "",
      fulfillment: "PICKUP",
      deliveryZoneId: "",
      addressStreet: "",
      addressNumber: "",
      addressComplement: "",
      addressNeighborhood: "",
      addressCity: "",
      addressState: "",
      addressZip: "",
      paymentMethod: "CASH",
      changeFor: undefined,
      notes: "Pedido QA",
      items: [{ productId: productNormal.id, variantId: "", quantity: 1 }],
      auth: { authMode: "register", username: `qacustomer_${opts.subdomain}`, password: "QaTeste@2026" },
    } as never,
    { mode: "register", username: `qacustomer_${opts.subdomain}`, password: "QaTeste@2026" }
  );
  if (!orderResult.ok) throw new Error(`Falha ao criar pedido QA (${opts.subdomain}): ${orderResult.error}`);

  const repairOrder = await prisma.repairOrder.create({
    data: {
      tenantId: tenant.id,
      number: 1,
      sellerId: seller.id,
      createdById: admin.id,
      customerId: customer.id,
      brand: "MarcaQA",
      model: "ModeloQA",
      status: "RECEIVED",
      items: {
        create: [{ description: "Troca de tela QA", unitPrice: 150, quantity: 1 }],
      },
    },
  });

  await prisma.employeeLedgerEntry.create({
    data: {
      tenantId: tenant.id,
      userId: seller.id,
      type: "ADVANCE",
      amount: 100,
      description: "Adiantamento QA",
      createdById: admin.id,
    },
  });

  const convenio = await prisma.convenio.create({
    data: {
      tenantId: tenant.id,
      name: `Convênio QA ${opts.subdomain}`,
      slug: `convenio-qa-${opts.subdomain}`,
      rules: { benefitAmount: 10, requireProof: false, usesPerPeriod: 1, periodDays: 30 },
    },
  });
  const convenioMember = await prisma.convenioMember.create({
    data: {
      tenantId: tenant.id,
      convenioId: convenio.id,
      name: `Colaborador Convênio QA ${opts.subdomain}`,
      document: crypto.randomUUID().slice(0, 11),
      selfieUrl: "https://placehold.co/200x200",
      status: "ACTIVE",
      credentialTokenHash: crypto.randomBytes(32).toString("hex"),
      shortCode: crypto.randomInt(100000, 999999).toString(),
    },
  });

  return {
    tenant,
    admin,
    seller,
    customer,
    productNormal,
    productLastUnit,
    cashRegister,
    saleId: saleResult.ok ? saleResult.saleId : null,
    orderId: orderResult.ok ? orderResult.orderId : null,
    repairOrderId: repairOrder.id,
    convenioId: convenio.id,
    convenioMemberId: convenioMember.id,
  };
}

console.log("Removendo resquícios de rodadas anteriores...");
await wipeTenant(SUBDOMAIN_A);
await wipeTenant(SUBDOMAIN_B);

console.log("Criando Tenant A (política de estoque RESERVE)...");
const a = await seedTenant({ subdomain: SUBDOMAIN_A, name: "QA Loja Teste A", stockPolicy: "RESERVE" });

console.log("Criando Tenant B (política de estoque DEDUCT)...");
const b = await seedTenant({ subdomain: SUBDOMAIN_B, name: "QA Loja Teste B", stockPolicy: "DEDUCT" });

console.log("\n=== SEED DE QA MULTI-TENANT CRIADO ===");
console.log(JSON.stringify({ tenantA: a.tenant.id, tenantB: b.tenant.id }, null, 2));

await prisma.$disconnect();
await pool.end();
