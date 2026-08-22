/**
 * Etapa B da Auditoria Mestra — cancelamento duplo e pagamento misto/arredondamento,
 * executados contra o banco `dev-local`.
 *
 * Pré-requisito: rode `npm run qa:multitenant:seed` antes desta suíte.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale, cancelSale } from "@/modules/sales/sale-service";
import { loadQaTenant, SUBDOMAIN_A } from "./qa-fixtures";

let a: Awaited<ReturnType<typeof loadQaTenant>>;

beforeAll(async () => {
  a = await loadQaTenant(SUBDOMAIN_A);
});

describe("Etapa B — cancelamento duplo", () => {
  it("a segunda tentativa de cancelar a mesma venda é rejeitada e o estoque não é devolvido duas vezes", async () => {
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: a.productNormal.id },
      select: { stockQty: true },
    });

    const sale = await createSale(
      {
        tenantId: a.tenant.id,
        sellerId: a.seller.id,
        cashRegisterId: a.cashRegister.id,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: a.seller.id,
      },
      {
        sellerId: a.seller.id,
        customerId: a.customer.id,
        items: [{ productId: a.productNormal.id, variantId: "", quantity: 1, discount: 0 }],
        payments: [{ method: "CASH", amount: 50 }],
        cashReceived: 50,
      } as never
    );
    expect(sale.ok).toBe(true);
    if (!sale.ok) return;

    const afterSale = await prisma.product.findUniqueOrThrow({
      where: { id: a.productNormal.id },
      select: { stockQty: true },
    });
    expect(afterSale.stockQty).toBe(before.stockQty - 1);

    const firstCancel = await cancelSale(a.tenant.id, sale.saleId, a.admin.id, "cancelamento QA #1");
    expect(firstCancel.ok).toBe(true);

    const afterFirstCancel = await prisma.product.findUniqueOrThrow({
      where: { id: a.productNormal.id },
      select: { stockQty: true },
    });
    expect(afterFirstCancel.stockQty).toBe(before.stockQty);

    const secondCancel = await cancelSale(a.tenant.id, sale.saleId, a.admin.id, "cancelamento QA #2");
    expect(secondCancel.ok).toBe(false);
    if (!secondCancel.ok) expect(secondCancel.error).toBe("Esta venda já está cancelada.");

    const afterSecondCancel = await prisma.product.findUniqueOrThrow({
      where: { id: a.productNormal.id },
      select: { stockQty: true },
    });
    // Estoque não pode ter sido devolvido de novo (ficaria > before.stockQty).
    expect(afterSecondCancel.stockQty).toBe(before.stockQty);
  });
});

describe("Etapa B — pagamento misto (split) e tolerância de arredondamento", () => {
  // productNormal custa R$50 — 2 unidades = total exato de R$100,00, sem desconto.
  function itemsFor100() {
    return [{ productId: a.productNormal.id, variantId: "", quantity: 2, discount: 0 }];
  }

  it("venda de R$100 dividida em dinheiro + débito + PIX, soma exata — aceita", async () => {
    const result = await createSale(
      {
        tenantId: a.tenant.id,
        sellerId: a.seller.id,
        cashRegisterId: a.cashRegister.id,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: a.seller.id,
      },
      {
        sellerId: a.seller.id,
        items: itemsFor100(),
        payments: [
          { method: "CASH", amount: 20 },
          { method: "DEBIT", amount: 30 },
          { method: "PIX", amount: 50 },
        ],
        cashReceived: 20,
      } as never
    );
    expect(result.ok).toBe(true);
  });

  it("soma dos pagamentos R$99,99 (diferença de 1 centavo) — rejeitada", async () => {
    const result = await createSale(
      {
        tenantId: a.tenant.id,
        sellerId: a.seller.id,
        cashRegisterId: a.cashRegister.id,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: a.seller.id,
      },
      {
        sellerId: a.seller.id,
        items: itemsFor100(),
        payments: [{ method: "PIX", amount: 99.99 }],
      } as never
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("não corresponde ao total da venda");
    }
  });

  it("soma dos pagamentos R$100,01 (diferença de 1 centavo) — rejeitada", async () => {
    const result = await createSale(
      {
        tenantId: a.tenant.id,
        sellerId: a.seller.id,
        cashRegisterId: a.cashRegister.id,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: a.seller.id,
      },
      {
        sellerId: a.seller.id,
        items: itemsFor100(),
        payments: [{ method: "PIX", amount: 100.01 }],
      } as never
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("não corresponde ao total da venda");
    }
  });

  it("soma dos pagamentos R$100,00 exato — aceita", async () => {
    const result = await createSale(
      {
        tenantId: a.tenant.id,
        sellerId: a.seller.id,
        cashRegisterId: a.cashRegister.id,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: a.seller.id,
      },
      {
        sellerId: a.seller.id,
        items: itemsFor100(),
        payments: [{ method: "PIX", amount: 100.0 }],
      } as never
    );
    expect(result.ok).toBe(true);
  });
});
