/**
 * Testes de integração de `editSaleItems` quando a correção muda o total da
 * venda (ex.: desconto esquecido) — os pagamentos, o troco e o "total gasto"
 * do cliente acompanham. Mesmo padrão de fixture própria de
 * `sale-payment-edit.integration.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { editSaleItems } from "./sale-service";

const SUBDOMAIN = "qa-sale-total-edit-test";

let tenantId: string;
let sellerId: string;
let cashRegisterId: string;
let productId: string;
let customerId: string;
let saleCounter = 0;

async function cleanup() {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) {
    await prisma.sale.deleteMany({ where: { tenantId: previous.id } });
    await prisma.tenant.delete({ where: { id: previous.id } });
  }
}

/** Venda de 2 itens (R$ 60 + R$ 40 = R$ 100) paga com `payments`. */
async function createFakeSale(
  payments: { method: string; amount: number }[],
  extra: { cashReceived?: number; changeAmount?: number; withCustomer?: boolean } = {}
) {
  saleCounter += 1;
  return prisma.sale.create({
    data: {
      tenantId,
      number: 800000 + saleCounter,
      cashRegisterId,
      sellerId,
      customerId: extra.withCustomer ? customerId : null,
      subtotal: 100,
      total: 100,
      cashReceived: extra.cashReceived ?? null,
      changeAmount: extra.changeAmount ?? 0,
      items: {
        create: [
          { productId, nameSnapshot: "Item A", quantity: 1, unitPrice: 60, total: 60 },
          { productId, nameSnapshot: "Item B", quantity: 1, unitPrice: 40, total: 40 },
        ],
      },
      payments: { create: payments.map((p) => ({ method: p.method as never, amount: p.amount })) },
    },
    include: { payments: true, items: { orderBy: { nameSnapshot: "asc" } } },
  });
}

/** Dá R$ 10 de desconto no Item B (total 100 → 90). */
function discountItemB(sale: Awaited<ReturnType<typeof createFakeSale>>) {
  const itemB = sale.items.find((i) => i.nameSnapshot === "Item B")!;
  return [{ itemId: itemB.id, unitPrice: 40, discount: 10 }];
}

beforeAll(async () => {
  await cleanup();

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Correção de Total",
      tradeName: "QA Correção de Total",
      document: `qa-ste-${Date.now()}`,
      phone: "(47) 3000-0003",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;

  const seller = await prisma.user.create({
    data: { tenantId, name: "Vendedor QA", email: `vendedor@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "SELLER" },
  });
  sellerId = seller.id;

  const cashRegister = await prisma.cashRegister.create({
    data: { tenantId, openedById: seller.id, openingAmount: 0 },
  });
  cashRegisterId = cashRegister.id;

  const [category, supplier] = await Promise.all([
    prisma.category.create({ data: { tenantId, name: "Categoria QA Total" } }),
    prisma.supplier.create({ data: { tenantId, name: "Fornecedor QA Total", phone: "(11) 3000-0000" } }),
  ]);
  const product = await prisma.product.create({
    data: {
      tenantId,
      name: "Produto QA Total",
      internalCode: `QA-STE-${Date.now()}`,
      barcode: `QASTE${Date.now()}`,
      categoryId: category.id,
      supplierId: supplier.id,
      costPrice: 10,
      salePrice: 60,
      catalogPrice: 60,
      stockQty: 1000,
      minStock: 0,
      active: true,
    },
  });
  productId = product.id;

  const customer = await prisma.customer.create({
    data: { tenantId, name: "Cliente QA Total", totalSpent: 100 },
  });
  customerId = customer.id;
});

afterAll(cleanup);

describe("editSaleItems — correção que muda o total", () => {
  it("baixa o total de 100 para 90 e o pagamento em cartão junto", async () => {
    const sale = await createFakeSale([{ method: "CREDIT", amount: 100 }]);
    const result = await editSaleItems(tenantId, sale.id, sellerId, discountItemB(sale), [
      { paymentId: sale.payments[0].id, amount: 90 },
    ]);

    expect(result).toMatchObject({ ok: true, totalBefore: 100, totalAfter: 90 });
    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { payments: true } });
    expect(Number(updated.total)).toBe(90);
    expect(Number(updated.discount)).toBe(10);
    expect(updated.payments.map((p) => Number(p.amount))).toEqual([90]);
  });

  it("recusa quando os pagamentos não somam o novo total", async () => {
    const sale = await createFakeSale([{ method: "PIX", amount: 100 }]);
    const result = await editSaleItems(tenantId, sale.id, sellerId, discountItemB(sale));

    expect(result.ok).toBe(false);
    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(Number(updated.total)).toBe(100);
  });

  it("permite aumentar o total, somando a diferença no pagamento", async () => {
    const sale = await createFakeSale([{ method: "PIX", amount: 100 }]);
    const itemA = sale.items.find((i) => i.nameSnapshot === "Item A")!;
    const result = await editSaleItems(
      tenantId,
      sale.id,
      sellerId,
      [{ itemId: itemA.id, unitPrice: 75, discount: 0 }],
      [{ paymentId: sale.payments[0].id, amount: 115 }]
    );

    expect(result).toMatchObject({ ok: true, totalAfter: 115 });
    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { payments: true } });
    expect(Number(updated.total)).toBe(115);
    expect(Number(updated.payments[0].amount)).toBe(115);
  });

  it("acompanha o total gasto do cliente", async () => {
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const sale = await createFakeSale([{ method: "DEBIT", amount: 100 }], { withCustomer: true });
    await editSaleItems(tenantId, sale.id, sellerId, discountItemB(sale), [
      { paymentId: sale.payments[0].id, amount: 90 },
    ]);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(Number(after.totalSpent)).toBe(Number(before.totalSpent) - 10);
  });

  it("em dinheiro, o recebido não muda e a diferença vira troco", async () => {
    const sale = await createFakeSale([{ method: "CASH", amount: 100 }], { cashReceived: 100, changeAmount: 0 });
    await editSaleItems(tenantId, sale.id, sellerId, discountItemB(sale), [
      { paymentId: sale.payments[0].id, amount: 90 },
    ]);

    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(Number(updated.cashReceived)).toBe(100);
    expect(Number(updated.changeAmount)).toBe(10);
  });

  it("remove o pagamento que ficou zerado", async () => {
    const sale = await createFakeSale([
      { method: "CREDIT", amount: 90 },
      { method: "PIX", amount: 10 },
    ]);
    const credit = sale.payments.find((p) => p.method === "CREDIT")!;
    const pix = sale.payments.find((p) => p.method === "PIX")!;
    const result = await editSaleItems(tenantId, sale.id, sellerId, discountItemB(sale), [
      { paymentId: credit.id, amount: 90 },
      { paymentId: pix.id, amount: 0 },
    ]);

    expect(result.ok).toBe(true);
    const payments = await prisma.payment.findMany({ where: { saleId: sale.id } });
    expect(payments.map((p) => p.method)).toEqual(["CREDIT"]);
  });

  it("bloqueia mudar o total quando há pagamento em Fiado", async () => {
    const sale = await createFakeSale([
      { method: "PIX", amount: 50 },
      { method: "FIADO", amount: 50 },
    ]);
    const pix = sale.payments.find((p) => p.method === "PIX")!;
    const result = await editSaleItems(tenantId, sale.id, sellerId, discountItemB(sale), [
      { paymentId: pix.id, amount: 40 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Fiado");
  });

  it("continua permitindo redistribuir sem mudar o total", async () => {
    const sale = await createFakeSale([{ method: "FIADO", amount: 100 }]);
    const [itemA, itemB] = sale.items;
    const result = await editSaleItems(tenantId, sale.id, sellerId, [
      { itemId: itemA.id, unitPrice: 50, discount: 0 },
      { itemId: itemB.id, unitPrice: 50, discount: 0 },
    ]);

    expect(result).toMatchObject({ ok: true, totalBefore: 100, totalAfter: 100, paymentChanges: [] });
  });
});
