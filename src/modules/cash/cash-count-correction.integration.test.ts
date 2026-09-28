/**
 * Testes de integração da correção de contagem do caixa pelo Admin —
 * `correctPendingCashCount` (caixa pendente de revisão) e a justificativa
 * obrigatória de `editClosedCashRegister` (caixa fechado). O valor original e
 * quem contou nunca se perdem: ficam nas observações do caixa.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { correctPendingCashCount, editClosedCashRegister } from "./cash-service";

const SUBDOMAIN = "qa-cash-count-correction-test";

let tenantId: string;
let sellerId: string;
const admin = { userId: "", userName: "Admin QA" };

async function cleanup() {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });
}

function createRegister(status: "PENDING_REVIEW" | "CLOSED", countedAmount: number) {
  return prisma.cashRegister.create({
    data: {
      tenantId,
      openedById: sellerId,
      openingAmount: 0,
      status,
      expectedAmount: 936.08,
      countedAmount,
      reviewSubmittedById: sellerId,
      reviewSubmittedAt: new Date(),
      countedDebitAmount: status === "CLOSED" ? 0 : null,
      countedCreditAmount: status === "CLOSED" ? 0 : null,
      countedPixAmount: status === "CLOSED" ? 0 : null,
      notes: "Contagem feita no fim do dia.",
    },
  });
}

beforeAll(async () => {
  await cleanup();
  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Correção de Caixa",
      tradeName: "QA Correção de Caixa",
      document: `qa-ccc-${Date.now()}`,
      phone: "(47) 3000-0004",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;

  const [seller, adminUser] = await Promise.all([
    prisma.user.create({
      data: { tenantId, name: "Maiza QA", email: `vendedora@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "SELLER" },
    }),
    prisma.user.create({
      data: { tenantId, name: "Admin QA", email: `dono@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
    }),
  ]);
  sellerId = seller.id;
  admin.userId = adminUser.id;
});

afterAll(cleanup);

describe("correctPendingCashCount — caixa pendente de revisão", () => {
  it("corrige o valor e guarda o original, quem contou e a justificativa", async () => {
    const register = await createRegister("PENDING_REVIEW", 11280);
    const result = await correctPendingCashCount(
      { tenantId, ...admin },
      { registerId: register.id, countedAmount: 936, reason: "Digitou um zero a mais" }
    );

    expect(result.ok).toBe(true);
    const updated = await prisma.cashRegister.findUniqueOrThrow({ where: { id: register.id } });
    expect(Number(updated.countedAmount)).toBe(936);
    expect(updated.status).toBe("PENDING_REVIEW");
    expect(updated.notes).toContain("Contagem feita no fim do dia.");
    expect(updated.notes).toContain("informado por Maiza QA");
    expect(updated.notes).toContain("11.280,00");
    expect(updated.notes).toContain("Justificativa: Digitou um zero a mais");
    expect(updated.notes).toContain("Corrigido por Admin QA");
  });

  it("exige justificativa", async () => {
    const register = await createRegister("PENDING_REVIEW", 11280);
    const result = await correctPendingCashCount(
      { tenantId, ...admin },
      { registerId: register.id, countedAmount: 936, reason: "  " }
    );

    expect(result.ok).toBe(false);
    const updated = await prisma.cashRegister.findUniqueOrThrow({ where: { id: register.id } });
    expect(Number(updated.countedAmount)).toBe(11280);
  });

  it("não serve para caixa já fechado", async () => {
    const register = await createRegister("CLOSED", 11280);
    const result = await correctPendingCashCount(
      { tenantId, ...admin },
      { registerId: register.id, countedAmount: 936, reason: "Digitou um zero a mais" }
    );
    expect(result.ok).toBe(false);
  });
});

describe("editClosedCashRegister — justificativa obrigatória", () => {
  const values = { countedDebitAmount: 0, countedCreditAmount: 0, countedPixAmount: 0 };

  it("recusa mudar valor sem justificativa", async () => {
    const register = await createRegister("CLOSED", 11280);
    const result = await editClosedCashRegister(
      { tenantId, ...admin },
      { registerId: register.id, countedAmount: 936, ...values, reason: "" }
    );
    expect(result.ok).toBe(false);
  });

  it("com justificativa, registra valor antigo, quem contou e o motivo", async () => {
    const register = await createRegister("CLOSED", 11280);
    const result = await editClosedCashRegister(
      { tenantId, ...admin },
      { registerId: register.id, countedAmount: 936, ...values, reason: "Conferido com a gaveta" }
    );

    expect(result.ok).toBe(true);
    const updated = await prisma.cashRegister.findUniqueOrThrow({ where: { id: register.id } });
    expect(Number(updated.countedAmount)).toBe(936);
    expect(updated.notes).toContain("informado por Maiza QA");
    expect(updated.notes).toContain("Justificativa: Conferido com a gaveta");
  });

  it("só observações, sem mudar valor, não exige justificativa", async () => {
    const register = await createRegister("CLOSED", 500);
    const result = await editClosedCashRegister(
      { tenantId, ...admin },
      { registerId: register.id, countedAmount: 500, ...values, notes: "Tudo certo" }
    );
    expect(result).toMatchObject({ ok: true, changeDescription: null });
  });
});
