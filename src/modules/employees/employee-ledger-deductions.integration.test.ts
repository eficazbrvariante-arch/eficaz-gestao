/**
 * Desconto automático de Adiantamento/Mercadoria ao marcar um Pagamento por
 * horas como pago (`settleEmployeeLedgerEntry`/`confirmEmployeeLedgerEntryBySelfie`)
 * e a volta pra pendente ao reverter/excluir o pagamento.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  confirmEmployeeLedgerEntryBySelfie,
  createEmployeeLedgerEntry,
  deleteEmployeeLedgerEntry,
  getEmployeeDeductionsPending,
  listEmployeesOwingPurchases,
  listPendingLedgerEntriesForEmployee,
  revertEmployeeLedgerEntryToPending,
  settleEmployeeLedgerEntry,
} from "@/modules/employees/employee-ledger-service";

const SUBDOMAIN = "qa-employee-ledger-deductions";

let tenantId: string;
let adminId: string;
let employeeId: string;

/** `amount` é o valor que fica gravado — na mercadoria, passa o preço cheio equivalente (antes dos 20%). */
async function addEntry(type: "ADVANCE" | "PURCHASE" | "HOURLY_PAYMENT", amount: number, selfieUrl?: string) {
  const result = await createEmployeeLedgerEntry(
    { tenantId, createdById: adminId },
    {
      userId: employeeId,
      type,
      amount: type === "PURCHASE" ? amount / 0.8 : amount,
      description: `${type} ${amount}`,
    },
    selfieUrl
  );
  if (!result.ok) throw new Error(result.error);
  // `createdAt` distinto e crescente — a ordem do desconto é do mais antigo pro mais novo.
  await new Promise((resolve) => setTimeout(resolve, 5));
  return result.id;
}

beforeAll(async () => {
  await prisma.tenant.deleteMany({ where: { subdomain: SUBDOMAIN } });
  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Lançamentos",
      tradeName: "QA Lançamentos",
      document: `qa-${Date.now()}`,
      phone: "(47) 3000-0000",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;
  const [admin, employee] = await Promise.all([
    prisma.user.create({
      data: { tenantId, name: "Admin QA", email: `admin@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
    }),
    prisma.user.create({
      data: { tenantId, name: "Colaborador QA", email: `colab@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "SELLER" },
    }),
  ]);
  adminId = admin.id;
  employeeId = employee.id;
});

beforeEach(async () => {
  await prisma.employeeLedgerEntry.deleteMany({ where: { tenantId } });
});

describe("desconto automático no pagamento por horas", () => {
  it("quita adiantamento e mercadoria ao marcar o pagamento como pago", async () => {
    await addEntry("ADVANCE", 100);
    await addEntry("PURCHASE", 50, "https://example.com/selfie.jpg");
    const paymentId = await addEntry("HOURLY_PAYMENT", 500);

    const result = await settleEmployeeLedgerEntry(tenantId, paymentId);
    expect(result).toMatchObject({ ok: true, deducted: 150 });
    expect(await getEmployeeDeductionsPending(tenantId, employeeId)).toEqual({
      advancePending: 0,
      purchasePending: 0,
    });

    const deducted = await prisma.employeeLedgerEntry.findMany({
      where: { tenantId, deductedInEntryId: paymentId },
    });
    expect(deducted).toHaveLength(2);
    expect(deducted.every((entry) => entry.status === "PAID")).toBe(true);
  });

  it("divide o lançamento quando o desconto passa o valor do pagamento", async () => {
    await addEntry("ADVANCE", 80);
    await addEntry("PURCHASE", 70);
    const paymentId = await addEntry("HOURLY_PAYMENT", 100);

    const result = await settleEmployeeLedgerEntry(tenantId, paymentId);
    expect(result).toMatchObject({ ok: true, deducted: 100 });
    // Adiantamento (mais antigo) inteiro + 20 da mercadoria; restam 50 pendentes.
    expect(await getEmployeeDeductionsPending(tenantId, employeeId)).toEqual({
      advancePending: 0,
      purchasePending: 50,
    });
  });

  it("reverter o pagamento devolve os descontos pra pendente", async () => {
    await addEntry("ADVANCE", 100);
    await addEntry("PURCHASE", 30);
    const paymentId = await addEntry("HOURLY_PAYMENT", 300);
    await settleEmployeeLedgerEntry(tenantId, paymentId);

    const reverted = await revertEmployeeLedgerEntryToPending(tenantId, paymentId);
    expect(reverted.ok).toBe(true);
    expect(await getEmployeeDeductionsPending(tenantId, employeeId)).toEqual({
      advancePending: 100,
      purchasePending: 30,
    });
    const linked = await prisma.employeeLedgerEntry.count({ where: { tenantId, deductedInEntryId: paymentId } });
    expect(linked).toBe(0);
  });

  it("excluir o pagamento devolve os descontos pra pendente", async () => {
    await addEntry("PURCHASE", 40);
    const paymentId = await addEntry("HOURLY_PAYMENT", 200);
    await settleEmployeeLedgerEntry(tenantId, paymentId);

    const deleted = await deleteEmployeeLedgerEntry(tenantId, paymentId);
    expect(deleted.ok).toBe(true);
    expect(await getEmployeeDeductionsPending(tenantId, employeeId)).toEqual({
      advancePending: 0,
      purchasePending: 40,
    });
  });

  it("confirmação por selfie no Ponto também desconta", async () => {
    await addEntry("ADVANCE", 60);
    const paymentId = await addEntry("HOURLY_PAYMENT", 200);

    const result = await confirmEmployeeLedgerEntryBySelfie(
      tenantId,
      employeeId,
      paymentId,
      "https://example.com/recebimento.jpg"
    );
    expect(result).toMatchObject({ ok: true, deducted: 60 });
    expect(await getEmployeeDeductionsPending(tenantId, employeeId)).toEqual({
      advancePending: 0,
      purchasePending: 0,
    });
  });

  it("marcar como pago duas vezes não desconta de novo", async () => {
    await addEntry("ADVANCE", 50);
    const paymentId = await addEntry("HOURLY_PAYMENT", 100);
    const [first, second] = await Promise.all([
      settleEmployeeLedgerEntry(tenantId, paymentId),
      settleEmployeeLedgerEntry(tenantId, paymentId),
    ]);
    const deductedTotal = [first, second].reduce((sum, r) => sum + (r.ok ? r.deducted : 0), 0);
    expect(deductedTotal).toBe(50);
  });

  it("lançamento com selfie guarda a foto", async () => {
    const id = await addEntry("PURCHASE", 15, "https://example.com/lancamento.jpg");
    const entry = await prisma.employeeLedgerEntry.findUniqueOrThrow({ where: { id } });
    expect(entry.selfieUrl).toBe("https://example.com/lancamento.jpg");
    expect(entry.status).toBe("PENDING");
  });
});

describe("desconto de colaborador na mercadoria", () => {
  it("grava 80% do preço cheio e guarda o preço cheio na descrição", async () => {
    const result = await createEmployeeLedgerEntry(
      { tenantId, createdById: adminId },
      { userId: employeeId, type: "PURCHASE", amount: 49.9, description: "Capinha" }
    );
    expect(result).toMatchObject({ ok: true, amount: 39.92 });
    if (!result.ok) return;
    const entry = await prisma.employeeLedgerEntry.findUniqueOrThrow({ where: { id: result.id } });
    expect(Number(entry.amount)).toBe(39.92);
    expect(entry.description).toContain("Capinha");
    expect(entry.description).toContain("20% de desconto de colaborador");
  });

  it("não aplica desconto em adiantamento", async () => {
    const result = await createEmployeeLedgerEntry(
      { tenantId, createdById: adminId },
      { userId: employeeId, type: "ADVANCE", amount: 100, description: "Vale" }
    );
    expect(result).toMatchObject({ ok: true, amount: 100 });
  });
});

describe("prévia do desconto no Ponto e aviso no Dashboard", () => {
  it("mostra quanto vai ser descontado do pagamento antes de confirmar", async () => {
    await addEntry("ADVANCE", 60);
    await addEntry("PURCHASE", 40);
    await addEntry("HOURLY_PAYMENT", 70);

    const [payment] = await listPendingLedgerEntriesForEmployee(tenantId, employeeId);
    expect(payment).toMatchObject({ type: "HOURLY_PAYMENT", amount: 70, deductionPreview: 70 });
  });

  it("lista quem deve mercadoria até ela ser descontada", async () => {
    await addEntry("PURCHASE", 40);
    await addEntry("PURCHASE", 10);
    await addEntry("ADVANCE", 30);

    expect(await listEmployeesOwingPurchases(tenantId)).toEqual([
      expect.objectContaining({ userId: employeeId, total: 50, count: 2 }),
    ]);

    const paymentId = await addEntry("HOURLY_PAYMENT", 500);
    await settleEmployeeLedgerEntry(tenantId, paymentId);
    expect(await listEmployeesOwingPurchases(tenantId)).toEqual([]);
  });
});
