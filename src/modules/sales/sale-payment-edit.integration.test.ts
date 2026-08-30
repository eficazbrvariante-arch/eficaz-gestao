/**
 * Testes de integração de `editSalePaymentMethods` — correção da forma de
 * pagamento de uma venda já concluída (ADMIN), sem mexer no valor de cada
 * pagamento. Mesmo padrão de fixture própria de
 * `credito-eficaz.integration.test.ts` (tenant/cliente/caixa criados no
 * `beforeAll`, só o singleton de `@/lib/prisma`).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { editSalePaymentMethods } from "./sale-service";

const SUBDOMAIN = "qa-sale-payment-edit-test";

let tenantId: string;
let sellerId: string;
let cashRegisterId: string;
let saleCounter = 0;

async function createFakeSale(payments: { method: string; amount: number }[]) {
  saleCounter += 1;
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  return prisma.sale.create({
    data: {
      tenantId,
      number: 700000 + saleCounter,
      cashRegisterId,
      sellerId,
      subtotal: total,
      total,
      payments: { create: payments.map((p) => ({ method: p.method as never, amount: p.amount })) },
    },
    include: { payments: true },
  });
}

beforeAll(async () => {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) {
    await prisma.sale.deleteMany({ where: { tenantId: previous.id } });
    await prisma.tenant.delete({ where: { id: previous.id } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Correção de Pagamento",
      tradeName: "QA Correção de Pagamento",
      document: `qa-spe-${Date.now()}`,
      phone: "(47) 3000-0002",
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
});

describe("editSalePaymentMethods — correção de forma de pagamento", () => {
  it("corrige um pagamento de Cartão de Crédito pra PIX, mantendo o valor", async () => {
    const sale = await createFakeSale([{ method: "CREDIT", amount: 100 }]);
    const payment = sale.payments[0];

    const result = await editSalePaymentMethods(tenantId, sale.id, [{ paymentId: payment.id, method: "PIX" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([{ before: "Cartão de Crédito", after: "PIX", amount: 100 }]);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.method).toBe("PIX");
    expect(Number(updated.amount)).toBe(100);
  });

  it("corrige só um dos pagamentos de uma venda com split, sem tocar nos outros", async () => {
    const sale = await createFakeSale([
      { method: "CASH", amount: 30 },
      { method: "DEBIT", amount: 70 },
    ]);
    const cashPayment = sale.payments.find((p) => p.method === "CASH")!;
    const debitPayment = sale.payments.find((p) => p.method === "DEBIT")!;

    const result = await editSalePaymentMethods(tenantId, sale.id, [{ paymentId: debitPayment.id, method: "CREDIT" }]);
    expect(result.ok).toBe(true);

    const updatedCash = await prisma.payment.findUniqueOrThrow({ where: { id: cashPayment.id } });
    const updatedDebit = await prisma.payment.findUniqueOrThrow({ where: { id: debitPayment.id } });
    expect(updatedCash.method).toBe("CASH");
    expect(updatedDebit.method).toBe("CREDIT");
  });

  it("recusa corrigir um pagamento em Crédito de loja, Fiado ou Crédito Eficaz", async () => {
    const sale = await createFakeSale([{ method: "STORE_CREDIT", amount: 40 }]);
    const payment = sale.payments[0];

    const result = await editSalePaymentMethods(tenantId, sale.id, [{ paymentId: payment.id, method: "CASH" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/efeito no cadastro do cliente/);

    const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(unchanged.method).toBe("STORE_CREDIT");
  });

  it("recusa quando não há alteração real (mesmo método enviado)", async () => {
    const sale = await createFakeSale([{ method: "CASH", amount: 20 }]);
    const payment = sale.payments[0];

    const result = await editSalePaymentMethods(tenantId, sale.id, [{ paymentId: payment.id, method: "CASH" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Nenhuma alteração informada.");
  });

  it("recusa corrigir venda já cancelada", async () => {
    const sale = await createFakeSale([{ method: "CREDIT", amount: 50 }]);
    const payment = sale.payments[0];
    await prisma.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });

    const result = await editSalePaymentMethods(tenantId, sale.id, [{ paymentId: payment.id, method: "PIX" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Venda cancelada não pode ser editada.");
  });

  it("recusa corrigir venda cujo caixa já foi fechado", async () => {
    const closedRegister = await prisma.cashRegister.create({
      data: { tenantId, openedById: sellerId, openingAmount: 0, status: "CLOSED", closedAt: new Date() },
    });
    saleCounter += 1;
    const sale = await prisma.sale.create({
      data: {
        tenantId,
        number: 700000 + saleCounter,
        cashRegisterId: closedRegister.id,
        sellerId,
        subtotal: 60,
        total: 60,
        payments: { create: [{ method: "CREDIT", amount: 60 }] },
      },
      include: { payments: true },
    });

    const result = await editSalePaymentMethods(tenantId, sale.id, [
      { paymentId: sale.payments[0].id, method: "PIX" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/caixa desta venda já foi fechado/);
  });
});
