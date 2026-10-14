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
  revertEmployeeLedgerEntryToPending,
  settleEmployeeLedgerEntry,
} from "@/modules/employees/employee-ledger-service";

const SUBDOMAIN = "qa-employee-ledger-deductions";

let tenantId: string;
let adminId: string;
let employeeId: string;

async function addEntry(type: "ADVANCE" | "PURCHASE" | "HOURLY_PAYMENT", amount: number, selfieUrl?: string) {
  const result = await createEmployeeLedgerEntry(
    { tenantId, createdById: adminId },
    { userId: employeeId, type, amount, description: `${type} ${amount}` },
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
