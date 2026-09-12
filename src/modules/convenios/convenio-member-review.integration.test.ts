/**
 * Revisão de cadastro de convênio pelo PDV (`convenio-member-review-service`):
 * só PENDENTE → ATIVO/CANCELADO, recusa exige motivo, decisão já tomada nunca
 * é sobrescrita, lista junta pendentes de todos os convênios e o link ativo
 * de cada um. Banco `dev-local`, fixture própria (mesmo padrão dos demais).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  countPendingConvenioMembers,
  listConvenioSignupLinks,
  listPendingConvenioMembers,
  reviewPendingConvenioMember,
} from "./convenio-member-review-service";

const SUBDOMAIN = "qa-convenio-review-test";

let tenantId: string;
let adminId: string;
let havanId: string;
let otherConvenioId: string;
let memberSeq = 0;

async function newMember(convenioId: string, status: "PENDING" | "ACTIVE" = "PENDING") {
  memberSeq += 1;
  return prisma.convenioMember.create({
    data: {
      tenantId,
      convenioId,
      name: `Colaborador QA ${memberSeq}`,
      document: `5299822472${memberSeq % 10}`,
      selfieUrl: "https://example.com/selfie.jpg",
      credentialTokenHash: randomBytes(16).toString("hex"),
      shortCode: String(100000 + memberSeq),
      status,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Convênio Review",
      tradeName: "QA Convênio Review",
      document: `qa-cr-${Date.now()}`,
      phone: "(47) 3000-0002",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;

  const admin = await prisma.user.create({
    data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
  });
  adminId = admin.id;

  const rules = { benefitAmount: 10, requireProof: true, usesPerPeriod: 1, periodDays: 30 };
  const [havan, other] = await Promise.all([
    prisma.convenio.create({ data: { tenantId, name: "Havan QA", slug: "havan-qa", rules } }),
    prisma.convenio.create({ data: { tenantId, name: "Outro QA", slug: "outro-qa", rules } }),
  ]);
  havanId = havan.id;
  otherConvenioId = other.id;

  // Só a Havan tem link ativo; o revogado nunca pode aparecer.
  await prisma.convenioInvite.create({
    data: { tenantId, convenioId: havanId, tokenHash: randomBytes(16).toString("hex"), token: "tok-revogado", createdById: adminId, revokedAt: new Date() },
  });
  await prisma.convenioInvite.create({
    data: { tenantId, convenioId: havanId, tokenHash: randomBytes(16).toString("hex"), token: "tok-ativo", createdById: adminId },
  });
});

describe("Revisão de cadastro de convênio pelo PDV", () => {
  it("1) lista pendentes de todos os convênios, com CPF mascarado, e ignora quem já está ativo", async () => {
    const a = await newMember(havanId);
    const b = await newMember(otherConvenioId);
    await newMember(havanId, "ACTIVE");

    const pending = await listPendingConvenioMembers(tenantId);
    const ids = pending.map((m) => m.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(pending.every((m) => !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(m.documentMasked))).toBe(true);
    expect(await countPendingConvenioMembers(tenantId)).toBe(pending.length);
  });

  it("2) aprovar muda PENDENTE → ATIVO e registra quem aprovou", async () => {
    const member = await newMember(havanId);
    const result = await reviewPendingConvenioMember(tenantId, member.id, adminId, "APPROVE", null);
    expect(result.ok).toBe(true);

    const after = await prisma.convenioMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.statusChangedById).toBe(adminId);
  });

  it("3) recusar exige motivo; com motivo vira CANCELADO", async () => {
    const member = await newMember(otherConvenioId);
    const noReason = await reviewPendingConvenioMember(tenantId, member.id, adminId, "REJECT", "  ");
    expect(noReason.ok).toBe(false);
    expect((await prisma.convenioMember.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("PENDING");

    const rejected = await reviewPendingConvenioMember(tenantId, member.id, adminId, "REJECT", "Foto não confere");
    expect(rejected.ok).toBe(true);
    const after = await prisma.convenioMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.statusReason).toBe("Foto não confere");
  });

  it("4) decisão já tomada nunca é sobrescrita (nem ativo pode ser recusado por aqui)", async () => {
    const member = await newMember(havanId);
    expect((await reviewPendingConvenioMember(tenantId, member.id, adminId, "APPROVE", null)).ok).toBe(true);

    const again = await reviewPendingConvenioMember(tenantId, member.id, adminId, "REJECT", "tentativa");
    expect(again.ok).toBe(false);
    expect((await prisma.convenioMember.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("ACTIVE");
  });

  it("5) links: o ativo de cada convênio, nunca o revogado; convênio sem link aparece sem URL", async () => {
    const links = await listConvenioSignupLinks(tenantId);
    const havan = links.find((l) => l.convenioId === havanId);
    const other = links.find((l) => l.convenioId === otherConvenioId);
    expect(havan?.url).toMatch(/\/convenio\/havan-qa\/tok-ativo$/);
    expect(other?.url).toBeNull();
  });

  it("6) não analisa cadastro de outra empresa (tenant)", async () => {
    const member = await newMember(havanId);
    const result = await reviewPendingConvenioMember("outro-tenant-inexistente", member.id, adminId, "APPROVE", null);
    expect(result.ok).toBe(false);
    expect((await prisma.convenioMember.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("PENDING");
  });
});
