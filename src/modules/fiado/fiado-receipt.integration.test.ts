/**
 * Recebimento de fiado (`receiveFiadoPayment`/`revertFiadoPayment`) e o
 * reflexo no caixa do dia (`getCashSummary`). Banco `dev-local`, fixture
 * própria (mesmo padrão dos demais testes de integração).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCashSummary } from "@/modules/cash/cash-service";
import { createFiadoEntry, receiveFiadoPayment, revertFiadoPayment } from "./fiado-service";

const SUBDOMAIN = "qa-fiado-receipt-test";

let tenantId: string;
let adminId: string;
let customerId: string;
let registerId: string;

async function newFiado(amount: number) {
  return createFiadoEntry(tenantId, { customerId, amount, dueDate: "2026-09-30", createdById: adminId });
}

beforeAll(async () => {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Fiado",
      tradeName: "QA Fiado",
      document: `qa-fiado-${Date.now()}`,
      phone: "(47) 3000-0003",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;
  const admin = await prisma.user.create({
    data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
  });
  adminId = admin.id;
  customerId = (await prisma.customer.create({ data: { tenantId, name: "Cliente QA Fiado" } })).id;
});

describe("Recebimento de fiado", () => {
  it("1) sem caixa aberto não recebe", async () => {
    const entry = await newFiado(10);
    const result = await receiveFiadoPayment(tenantId, entry.id, { method: "CASH", receivedById: adminId });
    expect(result.ok).toBe(false);
  });

  it("2) recebe em dinheiro: grava data, forma, quem recebeu e soma na gaveta do caixa aberto", async () => {
    registerId = (await prisma.cashRegister.create({ data: { tenantId, openedById: adminId, openingAmount: 100 } })).id;
    const before = await getCashSummary(tenantId, registerId);
    const entry = await newFiado(40);

    const result = await receiveFiadoPayment(tenantId, entry.id, { method: "CASH", receivedById: adminId });
    expect(result.ok).toBe(true);

    const saved = await prisma.fiadoEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(saved.status).toBe("PAID");
    expect(saved.paidAt).not.toBeNull();
    expect(saved.paymentMethod).toBe("CASH");
    expect(saved.paidById).toBe(adminId);
    expect(saved.paidCashRegisterId).toBe(registerId);

    const after = await getCashSummary(tenantId, registerId);
    expect(after.expectedInDrawer).toBe(before.expectedInDrawer + 40);
    expect(after.fiadoCashReceipts).toBe(40);
  });

  it("3) PIX entra no total de PIX, não na gaveta; receber de novo é recusado", async () => {
    const before = await getCashSummary(tenantId, registerId);
    const entry = await newFiado(25);
    expect((await receiveFiadoPayment(tenantId, entry.id, { method: "PIX", receivedById: adminId })).ok).toBe(true);
    expect((await receiveFiadoPayment(tenantId, entry.id, { method: "PIX", receivedById: adminId })).ok).toBe(false);

    const after = await getCashSummary(tenantId, registerId);
    expect(after.totalPix).toBe(before.totalPix + 25);
    expect(after.expectedInDrawer).toBe(before.expectedInDrawer);
  });

  it("4) voltar pra pendente tira do caixa; com o caixa fechado é bloqueado", async () => {
    const entry = await newFiado(15);
    await receiveFiadoPayment(tenantId, entry.id, { method: "CASH", receivedById: adminId });
    const withIt = await getCashSummary(tenantId, registerId);

    expect((await revertFiadoPayment(tenantId, entry.id)).ok).toBe(true);
    const reverted = await prisma.fiadoEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(reverted.status).toBe("PENDING");
    expect(reverted.paidAt).toBeNull();
    expect((await getCashSummary(tenantId, registerId)).expectedInDrawer).toBe(withIt.expectedInDrawer - 15);

    await receiveFiadoPayment(tenantId, entry.id, { method: "CASH", receivedById: adminId });
    await prisma.cashRegister.update({ where: { id: registerId }, data: { status: "CLOSED", closedAt: new Date() } });
    expect((await revertFiadoPayment(tenantId, entry.id)).ok).toBe(false);
  });
});
