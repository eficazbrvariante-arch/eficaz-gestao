/**
 * Testes de integração do desconto automático de combo "capinha + película de
 * hidrogel" — banco de verdade, `createSale` de verdade. A suíte unitária
 * (`lib/combo-discount.test.ts`) já cobre a contagem de combos; aqui o que
 * importa é o que efetivamente vai pro banco: o valor gravado em
 * `Sale.comboDiscount`, o total resultante, o teto que impede total negativo,
 * a não-acumulação com a Proteção Eficaz e o ajuste do crédito na troca.
 *
 * Mesmo padrão de fixture de `sale-payment-edit.integration.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createSale, reportSaleItemDefect } from "./sale-service";

const SUBDOMAIN = "qa-combo-discount-test";

let tenantId: string;
let sellerId: string;
let cashRegisterId: string;
let customerId: string;
let capinhaId: string;
let hidrogelId: string;
let pelicula3dId: string;
let carregadorId: string;

async function createProduct(name: string, salePrice: number, categoryId: string) {
  const product = await prisma.product.create({
    data: { tenantId, name, salePrice, costPrice: 0, stockQty: 1000, categoryId },
  });
  return product.id;
}

beforeAll(async () => {
  const previous = await prisma.tenant.findUnique({
    where: { subdomain: SUBDOMAIN },
    select: { id: true },
  });
  if (previous) {
    await prisma.customerCreditMovement.deleteMany({ where: { tenantId: previous.id } });
    await prisma.saleItemDefect.deleteMany({ where: { tenantId: previous.id } });
    await prisma.sale.deleteMany({ where: { tenantId: previous.id } });
    await prisma.tenant.delete({ where: { id: previous.id } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Combo Desconto",
      tradeName: "QA Combo Desconto",
      document: `qa-combo-${Date.now()}`,
      phone: "(47) 3000-0003",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;

  const seller = await prisma.user.create({
    data: {
      tenantId,
      name: "Vendedor QA",
      email: `vendedor@${SUBDOMAIN}.qa.test`,
      passwordHash: "qa",
      role: "ADMIN",
    },
  });
  sellerId = seller.id;

  const cashRegister = await prisma.cashRegister.create({
    data: { tenantId, openedById: seller.id, openingAmount: 0 },
  });
  cashRegisterId = cashRegister.id;

  const customer = await prisma.customer.create({
    data: { tenantId, name: "Cliente QA Combo" },
  });
  customerId = customer.id;

  const capas = await prisma.category.create({ data: { tenantId, name: "Capas" } });
  const peliculas = await prisma.category.create({ data: { tenantId, name: "Película" } });
  const acessorios = await prisma.category.create({ data: { tenantId, name: "Acessórios" } });

  capinhaId = await createProduct("Capinha Silicone iPhone 15", 30, capas.id);
  hidrogelId = await createProduct("Película Hidrogel iPhone 15", 40, peliculas.id);
  pelicula3dId = await createProduct("Película 3D iPhone 15", 30, peliculas.id);
  carregadorId = await createProduct("Carregador Turbo 20W", 50, acessorios.id);
});

function ctx() {
  return {
    tenantId,
    sellerId,
    cashRegisterId,
    allowDiscount: true,
    allowFreeDiscount: true,
    allowFiado: false,
    operatorId: sellerId,
  };
}

describe("createSale — desconto de combo", () => {
  it("aplica R$ 15 quando há capinha e hidrogel juntas", async () => {
    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 0 },
        { productId: hidrogelId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 55 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(Number(sale.subtotal)).toBe(70);
    expect(Number(sale.comboDiscount)).toBe(15);
    expect(sale.comboDiscountUnits).toBe(1);
    // 30 + 40 - 15 = 55
    expect(Number(sale.total)).toBe(55);
  });

  it("dois pares descontam R$ 30", async () => {
    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: capinhaId, quantity: 2, discount: 0 },
        { productId: hidrogelId, quantity: 2, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 110 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(Number(sale.comboDiscount)).toBe(30);
    expect(sale.comboDiscountUnits).toBe(2);
    expect(Number(sale.total)).toBe(110);
  });

  it("não aplica nada sem o par", async () => {
    const result = await createSale(ctx(), {
      sellerId,
      items: [{ productId: capinhaId, quantity: 3, discount: 0 }],
      payments: [{ method: "CASH", amount: 90 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(Number(sale.comboDiscount)).toBe(0);
    expect(Number(sale.total)).toBe(90);
  });

  it("película 3D não forma combo", async () => {
    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 0 },
        { productId: pelicula3dId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 60 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(Number(sale.comboDiscount)).toBe(0);
    expect(Number(sale.total)).toBe(60);
  });

  it("soma ao desconto manual do vendedor, sem substituí-lo", async () => {
    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 5 },
        { productId: hidrogelId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 50 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    // Desconto manual continua no campo dele, combo no campo próprio.
    expect(Number(sale.discount)).toBe(5);
    expect(Number(sale.comboDiscount)).toBe(15);
    // 70 - 5 - 15 = 50
    expect(Number(sale.total)).toBe(50);
  });

  it("nunca deixa o total negativo — o combo é limitado pelo que resta", async () => {
    // Desconto manual come quase tudo: sobram R$ 3 para um combo de R$ 15.
    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 29 },
        { productId: hidrogelId, quantity: 1, discount: 38 },
      ],
      payments: [{ method: "CASH", amount: 0 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(Number(sale.comboDiscount)).toBe(3);
    expect(Number(sale.total)).toBe(0);
  });

  it("não acumula com a Proteção Eficaz", async () => {
    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 0 },
        { productId: hidrogelId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 70 }],
      protecaoEficazOptedIn: true,
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(sale.protecaoEficazOptedIn).toBe(true);
    expect(Number(sale.comboDiscount)).toBe(0);
    expect(Number(sale.total)).toBe(70);
  });

  it("respeita as palavras configuradas pela empresa", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        comboDiscountSettings: {
          capinhaKeywords: ["carregador"],
          hidrogelKeywords: ["hidrogel"],
          excludeKeywords: [],
          amountPerCombo: 7,
        },
      },
    });

    const result = await createSale(ctx(), {
      sellerId,
      items: [
        { productId: carregadorId, quantity: 1, discount: 0 },
        { productId: hidrogelId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 83 }],
    } as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(Number(sale.comboDiscount)).toBe(7);
    expect(Number(sale.total)).toBe(83);

    // Volta ao padrão pra não vazar configuração pros testes seguintes.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { comboDiscountSettings: Prisma.DbNull },
    });
  });
});

describe("reportSaleItemDefect — troca desfaz o combo", () => {
  it("desconta do crédito os R$ 15 do combo que deixou de existir", async () => {
    const created = await createSale(ctx(), {
      customerId,
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 0 },
        { productId: hidrogelId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 55 }],
    } as never);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: created.saleId },
      include: { items: true },
    });
    expect(Number(sale.comboDiscount)).toBe(15);

    const capinhaItem = sale.items.find((i) => i.productId === capinhaId)!;
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    const result = await reportSaleItemDefect(tenantId, sale.id, sellerId, {
      saleItemId: capinhaItem.id,
      quantity: 1,
      reason: "Capinha veio rachada",
      photoUrls: [],
    });
    expect(result.ok).toBe(true);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const granted = Number(after.creditBalance) - Number(before.creditBalance);
    // Capinha de R$ 30, menos os R$ 15 do combo desfeito.
    expect(granted).toBe(15);

    const movement = await prisma.customerCreditMovement.findFirstOrThrow({
      where: { saleId: sale.id },
      orderBy: { createdAt: "desc" },
    });
    expect(movement.reason).toContain("combo capinha + película desfeito");
  });

  it("não mexe no crédito quando o item devolvido não era do combo", async () => {
    const created = await createSale(ctx(), {
      customerId,
      sellerId,
      items: [
        { productId: capinhaId, quantity: 1, discount: 0 },
        { productId: hidrogelId, quantity: 1, discount: 0 },
        { productId: carregadorId, quantity: 1, discount: 0 },
      ],
      payments: [{ method: "CASH", amount: 105 }],
    } as never);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: created.saleId },
      include: { items: true },
    });
    const carregadorItem = sale.items.find((i) => i.productId === carregadorId)!;
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    const result = await reportSaleItemDefect(tenantId, sale.id, sellerId, {
      saleItemId: carregadorItem.id,
      quantity: 1,
      reason: "Carregador não liga",
      photoUrls: [],
    });
    expect(result.ok).toBe(true);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    // Combo continua de pé (capinha e película seguem na nota): crédito cheio.
    expect(Number(after.creditBalance) - Number(before.creditBalance)).toBe(50);
  });
});
