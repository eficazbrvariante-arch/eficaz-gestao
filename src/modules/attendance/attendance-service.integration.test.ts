/**
 * `addMissingAttendanceEntry` — roda contra o banco `dev-local` (mesmo padrão
 * de `repair-service-catalog.integration.test.ts`). Cobre a trava de "já tem
 * marcação desse tipo" olhando o valor corrigido, não o original.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { addMissingAttendanceEntry, correctAttendanceEntry } from "./attendance-service";

const SUBDOMAIN = "qa-ponto-marcacao-corrigida-test";

let tenantId: string;
let adminId: string;
let employeeId: string;

async function removeTenant() {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });
}

/** Horário de Brasília num dia fixo de teste. */
function at(day: string, time: string) {
  return new Date(`${day}T${time}:00-03:00`);
}

beforeAll(async () => {
  await removeTenant();
  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Ponto",
      tradeName: "QA Ponto",
      document: `qa-ponto-${Date.now()}`,
      phone: "(47) 3000-0000",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;
  adminId = (
    await prisma.user.create({
      data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
    })
  ).id;
  employeeId = (
    await prisma.user.create({
      data: { tenantId, name: "Colaboradora QA", email: `colab@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "SELLER" },
    })
  ).id;
});

afterAll(removeTenant);

describe("addMissingAttendanceEntry", () => {
  it("recusa uma segunda saída no mesmo dia", async () => {
    const day = "2026-09-20";
    await prisma.attendanceEntry.create({
      data: { tenantId, userId: employeeId, type: "CLOCK_OUT", occurredAt: at(day, "18:00") },
    });
    const result = await addMissingAttendanceEntry(tenantId, adminId, {
      userId: employeeId,
      type: "CLOCK_OUT",
      occurredAt: at(day, "19:00"),
      reason: "teste",
    });
    expect(result).toEqual({ ok: false, error: "Esse dia já tem uma marcação desse tipo." });
  });

  it("aceita a saída quando a única saída do dia foi corrigida para intervalo", async () => {
    const day = "2026-09-24";
    await prisma.attendanceEntry.create({
      data: { tenantId, userId: employeeId, type: "CLOCK_IN", occurredAt: at(day, "09:00") },
    });
    const wrongOut = await prisma.attendanceEntry.create({
      data: { tenantId, userId: employeeId, type: "CLOCK_OUT", occurredAt: at(day, "13:00") },
    });
    const corrected = await correctAttendanceEntry(tenantId, adminId, {
      entryId: wrongOut.id,
      newType: "BREAK_START",
      newOccurredAt: at(day, "13:00"),
      reason: "bateu saída no lugar do intervalo",
    });
    expect(corrected.ok).toBe(true);

    const result = await addMissingAttendanceEntry(tenantId, adminId, {
      userId: employeeId,
      type: "CLOCK_OUT",
      occurredAt: at(day, "19:08"),
      reason: "correção",
    });
    expect(result.ok).toBe(true);
  });

  it("recusa quando outra marcação foi corrigida PARA esse tipo no mesmo dia", async () => {
    const day = "2026-09-25";
    const entry = await prisma.attendanceEntry.create({
      data: { tenantId, userId: employeeId, type: "BREAK_START", occurredAt: at(day, "18:00") },
    });
    await correctAttendanceEntry(tenantId, adminId, {
      entryId: entry.id,
      newType: "CLOCK_OUT",
      newOccurredAt: at(day, "18:00"),
      reason: "era a saída",
    });
    const result = await addMissingAttendanceEntry(tenantId, adminId, {
      userId: employeeId,
      type: "CLOCK_OUT",
      occurredAt: at(day, "19:00"),
      reason: "teste",
    });
    expect(result.ok).toBe(false);
  });
});
