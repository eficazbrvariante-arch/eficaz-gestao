import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import pg from "pg";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { computeCatalogPrice } from "../src/modules/products/catalog-price.js";
import { createSale } from "../src/modules/sales/sale-service.js";
import { createOrder, updateOrderStatus } from "../src/modules/orders/order-service.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// --- Empresa e usuário ---
const tenant = await prisma.tenant.create({
  data: {
    name: "EficazBr Eletrônicos",
    tradeName: "EficazBr Eletrônicos",
    document: "12.345.678/0001-90",
    phone: "(47) 3000-0000",
    whatsapp: "5547991923337",
    addressStreet: "Avenida Cônsul Carlos Renaux",
    addressNumber: "19",
    addressCity: "Brusque",
    addressState: "SC",
    addressZip: "88350001",
    subdomain: "eficazbr",
    email: "admin@eficazbr.test",
    primaryColor: "#1d4ed8",
    bannerTitle: "Eletrônicos com o melhor preço da região",
    bannerSubtitle: "Retire na loja ou receba em casa. Peça pelo WhatsApp.",
    catalogEnabled: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    stockPolicy: "RESERVE",
    pickupNotes: "Retirada de segunda a sexta, das 9h às 18h.",
  },
});

const admin = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    name: "Administrador Teste",
    email: "admin@eficazbr.test",
    passwordHash: await bcrypt.hash("NovaSenha@2026", 10),
    role: "ADMIN",
  },
});

const vendedor = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    name: "Ana Vendedora",
    email: "ana@eficazbr.test",
    passwordHash: await bcrypt.hash("NovaSenha@2026", 10),
    role: "SELLER",
  },
});

// --- Categorias, marcas, fornecedor ---
const celulares = await prisma.category.create({ data: { tenantId: tenant.id, name: "Celulares" } });
const acessorios = await prisma.category.create({ data: { tenantId: tenant.id, name: "Acessórios" } });
const samsung = await prisma.brand.create({ data: { tenantId: tenant.id, name: "Samsung" } });
const anker = await prisma.brand.create({ data: { tenantId: tenant.id, name: "Anker" } });
const fornecedor = await prisma.supplier.create({
  data: { tenantId: tenant.id, name: "Distribuidora Tech Ltda", phone: "(11) 3000-0000" },
});

// --- Produtos ---
async function produto(data: {
  name: string; code: string; barcode?: string; categoryId?: string; brandId?: string;
  cost: number; sale: number; promo?: number; stock: number; min: number; image: string;
  description?: string; variants?: { name: string; adj: number; stock: number }[];
}) {
  return prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: data.name,
      internalCode: data.code,
      barcode: data.barcode ?? null,
      categoryId: data.categoryId ?? null,
      brandId: data.brandId ?? null,
      supplierId: fornecedor.id,
      description: data.description ?? null,
      costPrice: data.cost,
      salePrice: data.sale,
      promoPrice: data.promo ?? null,
      catalogPrice: computeCatalogPrice(data.sale, data.promo ?? null),
      stockQty: data.stock,
      minStock: data.min,
      active: true,
      showInCatalog: true,
      images: { create: { url: data.image, order: 0 } },
      variants: data.variants
        ? { create: data.variants.map((v) => ({ name: v.name, priceAdjustment: v.adj, stockQty: v.stock })) }
        : undefined,
    },
    include: { variants: true },
  });
}

const galaxy = await produto({
  name: "Smartphone Galaxy A54", code: "SM-A54", barcode: "7891234567890",
  categoryId: celulares.id, brandId: samsung.id,
  cost: 1150, sale: 1799.9, promo: 1699.9, stock: 12, min: 3,
  image: "https://placehold.co/600x600/1d4ed8/ffffff/png?text=Galaxy+A54",
  description: "Smartphone 128GB, tela de 6.4 polegadas, câmera tripla.",
  variants: [{ name: "Preto", adj: 0, stock: 7 }, { name: "Branco", adj: 50, stock: 5 }],
});
const cabo = await produto({
  name: "Cabo USB-C 2m", code: "CB-USBC2", barcode: "7899999000011",
  categoryId: acessorios.id, brandId: anker.id,
  cost: 18.5, sale: 49.9, promo: 39.9, stock: 40, min: 10,
  image: "https://placehold.co/600x600/0f766e/ffffff/png?text=Cabo+USB-C",
  description: "Cabo trançado de 2 metros, carga rápida de até 60W.",
});
const capa = await produto({
  name: "Capa Silicone A54", code: "CP-A54",
  categoryId: acessorios.id, brandId: samsung.id,
  cost: 12, sale: 39.9, stock: 25, min: 5,
  image: "https://placehold.co/600x600/7c3aed/ffffff/png?text=Capa+A54",
});
const fone = await produto({
  name: "Fone Bluetooth TWS", code: "FN-TWS1",
  categoryId: acessorios.id, brandId: anker.id,
  cost: 45, sale: 129.9, stock: 3, min: 5,
  image: "https://placehold.co/600x600/be123c/ffffff/png?text=Fone+TWS",
});
// Produto parado: tem estoque e nunca vende
await produto({
  name: "Carregador 5W Antigo", code: "CR-5W",
  categoryId: acessorios.id,
  cost: 10, sale: 29.9, stock: 18, min: 0,
  image: "https://placehold.co/600x600/64748b/ffffff/png?text=Carregador",
});

// --- Clientes ---
const maria = await prisma.customer.create({
  data: { tenantId: tenant.id, name: "Maria Souza", document: "123.456.789-00", phone: "(47) 98888-7777", whatsapp: "5547988887777" },
});
await prisma.customer.create({
  data: { tenantId: tenant.id, name: "João Pereira", phone: "(47) 97777-6666" },
});

// --- Faixas de entrega ---
await prisma.deliveryZone.createMany({
  data: [
    { tenantId: tenant.id, name: "Centro", neighborhood: "Centro I", fee: 8, estimate: "até 2 horas" },
    { tenantId: tenant.id, name: "Brusque - demais bairros", zipStart: "88350000", zipEnd: "88359999", fee: 15, estimate: "até 24 horas" },
  ],
});

// --- Caixa e vendas no PDV ---
const caixa = await prisma.cashRegister.create({
  data: { tenantId: tenant.id, openedById: admin.id, openingAmount: 200 },
});

const ctx = (sellerId: string) => ({
  tenantId: tenant.id, sellerId, cashRegisterId: caixa.id, allowDiscount: true,
  allowFiado: true, operatorId: sellerId,
});

// Venda 1: dinheiro com troco (admin)
await createSale(ctx(admin.id), {
  sellerId: admin.id,
  customerId: maria.id,
  items: [{ productId: cabo.id, variantId: "", quantity: 2, discount: 0 }],
  payments: [{ method: "CASH", amount: 79.8 }],
  cashReceived: 100,
});

// Venda 2: variação + desconto + pagamento dividido (vendedora)
const variante = galaxy.variants[0];
await createSale(ctx(vendedor.id), {
  sellerId: vendedor.id,
  customerId: maria.id,
  items: [{ productId: galaxy.id, variantId: variante.id, quantity: 1, discount: 100 }],
  payments: [{ method: "PIX", amount: 800 }, { method: "CREDIT", amount: 799.9 }],
});

// Venda 3: cartão de débito (vendedora)
await createSale(ctx(vendedor.id), {
  sellerId: vendedor.id,
  items: [{ productId: capa.id, variantId: "", quantity: 3, discount: 0 }],
  payments: [{ method: "DEBIT", amount: 119.7 }],
});

// Venda 4: cancelada
const cancelada = await createSale(ctx(admin.id), {
  sellerId: admin.id,
  items: [{ productId: fone.id, variantId: "", quantity: 1, discount: 0 }],
  payments: [{ method: "PIX", amount: 129.9 }],
});
if (cancelada.ok) {
  const { cancelSale } = await import("../src/modules/sales/sale-service.js");
  await cancelSale(tenant.id, cancelada.saleId, admin.id, "Cliente desistiu na hora");
}

// Sangria
await prisma.cashMovement.create({
  data: { tenantId: tenant.id, cashRegisterId: caixa.id, type: "WITHDRAWAL", amount: 50, description: "Depósito bancário", userId: admin.id },
});

// --- Pedidos do catálogo ---
const pedido1 = await createOrder(
  tenant.id,
  {
    customerName: "Maria Souza", customerPhone: "(47) 98888-7777", customerEmail: "", customerDocument: "",
    fulfillment: "DELIVERY", deliveryZoneId: "",
    addressStreet: "Rua das Flores", addressNumber: "123", addressComplement: "Apto 4",
    addressNeighborhood: "Centro I", addressCity: "Brusque", addressState: "SC", addressZip: "88350001",
    paymentMethod: "PIX", changeFor: undefined, notes: "Entregar após as 18h",
    items: [{ productId: cabo.id, variantId: "", quantity: 1 }, { productId: capa.id, variantId: "", quantity: 1 }],
    auth: { authMode: "register", username: "mariasouza", password: "Demo12345" },
  },
  { mode: "register", username: "mariasouza", password: "Demo12345" }
);
if (pedido1.ok) {
  for (const s of ["CONFIRMED", "PREPARING", "SHIPPED", "COMPLETED"] as const) {
    await updateOrderStatus(tenant.id, pedido1.orderId, admin.id, s);
  }
}

// Pedido novo, aguardando confirmação
await createOrder(
  tenant.id,
  {
    customerName: "João Pereira", customerPhone: "(47) 97777-6666", customerEmail: "", customerDocument: "",
    fulfillment: "PICKUP", deliveryZoneId: "",
    addressStreet: "", addressNumber: "", addressComplement: "", addressNeighborhood: "",
    addressCity: "", addressState: "", addressZip: "",
    paymentMethod: "CASH", changeFor: 200, notes: "",
    items: [{ productId: galaxy.id, variantId: galaxy.variants[1].id, quantity: 1 }],
    auth: { authMode: "register", username: "joaopereira", password: "Demo12345" },
  },
  { mode: "register", username: "joaopereira", password: "Demo12345" }
);

console.log("=== BANCO DE DEMONSTRACAO RECRIADO ===");
console.log("Empresa:", tenant.name, "| subdominio:", tenant.subdomain);
console.log("Login admin: admin@eficazbr.test / NovaSenha@2026");
console.log("Login vendedora: ana@eficazbr.test / NovaSenha@2026");
console.log("Produtos:", await prisma.product.count({ where: { tenantId: tenant.id } }));
console.log("Vendas PDV:", await prisma.sale.count({ where: { tenantId: tenant.id } }));
console.log("Pedidos online:", await prisma.order.count({ where: { tenantId: tenant.id } }));

await prisma.$disconnect();
await pool.end();
