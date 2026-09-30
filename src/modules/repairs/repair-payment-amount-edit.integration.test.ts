/**
 * Correção do VALOR de um pagamento de OS (`editRepairOrderPaymentAmount`) —
 * roda contra o banco `dev-local` (mesmo padrão de
 * `repair-service-catalog.integration.test.ts`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRepairOrder } from "./repair-order-service";
import {
  deliverRepairOrder,
  editRepairOrderPaymentAmount,
  getRepairOrderFinancials,
  receiveRepairOrderPayment,
} from "./repair-payment-service";

const SUBDOMAIN = "qa-os-correcao-valor-test";

let tenantId: string;
let adminId: string;
let customerId: string;
let cashRegisterId: string;

async function removeTenant() {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });
}

async function newOrder(price: number) {
  const created = await createRepairOrder(
    { tenantId, userId: adminId },
    {
      customerId,
      sellerId: adminId,
      brand: "Samsung",
      model: "A22",
      turnsOn: true,
      discount: 0,
      items: [{ description: "Troca da frontal", unitPrice: price, quantity: 1 }],
      photoUrls: [],
    },
    { canSetCost: false }
  );
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

function ctx() {
  return { tenantId, userId: adminId, cashRegisterId, allowFiado: true };
}

beforeAll(async () => {
  await removeTenant();
  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Correção de Valor OS",
      tradeName: "QA Correção de Valor OS",
      document: `qa-ocv-${Date.now()}`,
      phone: "(47) 3000-0000",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;
  const admin = await prisma.user.create({
    data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
  });
  adminId = admin.id;
  customerId = (await prisma.customer.create({ data: { tenantId, name: "Cliente QA" } })).id;
  cashRegisterId = (
    await prisma.cashRegister.create({ data: { tenantId, openedById: adminId, openingAmount: 0 } })
  ).id;
});

afterAll(removeTenant);

describe("editRepairOrderPaymentAmount", () => {
  it("OS quitada: baixar o valor ajusta o total e a OS continua quitada", async () => {
    const id = await newOrder(380);
    expect((await deliverRepairOrder(ctx(), id, [{ method: "PIX", amount: 380 }])).ok).toBe(true);
    const paymentId = (await getRepairOrderFinancials(tenantId, id))!.payments[0].id;

    const result = await editRepairOrderPaymentAmount(tenantId, id, paymentId, 340);
    expect(result).toMatchObject({ ok: true, before: 380, after: 340, discountAdded: 40 });

    const financials = await getRepairOrderFinancials(tenantId, id);
    expect(financials).toMatchObject({ total: 340, paid: 340, balance: 0, situation: "QUITADO" });
  });

  it("OS com saldo pendente: baixar o valor só aumenta o saldo", async () => {
    const id = await newOrder(380);
    await receiveRepairOrderPayment(ctx(), id, [{ method: "CASH", amount: 100 }]);
    const paymentId = (await getRepairOrderFinancials(tenantId, id))!.payments[0].id;

    const result = await editRepairOrderPaymentAmount(tenantId, id, paymentId, 80);
    expect(result).toMatchObject({ ok: true, discountAdded: 0 });
    expect(await getRepairOrderFinancials(tenantId, id)).toMatchObject({ total: 380, paid: 80, balance: 300 });
  });

  it("não deixa o recebido passar do total da OS", async () => {
    const id = await newOrder(340);
    await receiveRepairOrderPayment(ctx(), id, [{ method: "CASH", amount: 300 }]);
    const paymentId = (await getRepairOrderFinancials(tenantId, id))!.payments[0].id;

    const result = await editRepairOrderPaymentAmount(tenantId, id, paymentId, 380);
    expect(result.ok).toBe(false);
    expect((await getRepairOrderFinancials(tenantId, id))!.paid).toBe(300);
  });
});
