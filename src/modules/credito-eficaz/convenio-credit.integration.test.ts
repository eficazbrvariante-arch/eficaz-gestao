/**
 * Testes de integração do Crédito Eficaz × Convênio — o segundo caminho de
 * entrada para o MESMO crédito. Roda contra o banco `dev-local`, mesma
 * fixture própria de `credito-eficaz.integration.test.ts` (tenant/usuário/
 * convênio/colaboradores criados no `beforeAll`).
 *
 * O que estes testes protegem, em ordem: a chave OFFLINE não fazer
 * absolutamente nada; ligar conceder a quem já está aprovado e ser
 * idempotente (ligar/desligar/ligar nunca duplica); não sobrescrever limite
 * decidido por humano; parcelas 30+60 com acréscimo; recomposição ao pagar;
 * bônus só por pagamento em dia; teto do crescimento automático; bloqueio
 * por parcela vencida; e alteração em massa que reduz limite sem jamais
 * mexer na dívida.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  updateConvenioCreditPolicy,
  applyPolicyToApprovedMembers,
  grantConvenioCreditOnApproval,
  resolveCustomerCreditTerms,
  applyBulkLimitChange,
  previewBulkLimitChange,
  getConvenioExposure,
  previewCampaignEligibility,
  registerCampaignEntries,
} from "./convenio-credit-service";
import {
  recordCreditoEficazUsageInTx,
  registerManualPayment,
  setCreditLimit,
  getCustomerCreditSummary,
  debitCreditoEficazInTx,
} from "./credito-eficaz-service";
import { buildCreditoEficazInstallments } from "./credito-eficaz-surcharge";

const SUBDOMAIN = "qa-convenio-credito-test";

let tenantId: string;
let adminId: string;
let convenioId: string;
/** Colaborador aprovado COM cadastro de cliente — o caso que recebe crédito. */
let memberCustomerId: string;
let memberId: string;
/** Segundo colaborador, usado nos testes de massa/exposição. */
let secondCustomerId: string;
/** Colaborador aprovado SEM cadastro de cliente — nunca pode receber nada. */
let memberWithoutCustomerId: string;
/** Cliente do fluxo normal — serve de controle: nada do convênio pode tocá-lo. */
let manualCustomerId: string;
let saleCounter = 0;

/** `Sale` mínima só pra satisfazer a FK de `CreditoEficazUsage.saleId`. */
async function createFakeSale(customerId: string, total: number) {
  saleCounter += 1;
  const cashRegister = await prisma.cashRegister.findFirstOrThrow({ where: { tenantId } });
  return prisma.sale.create({
    data: {
      tenantId,
      number: 900000 + saleCounter,
      sellerId: adminId,
      cashRegisterId: cashRegister.id,
      customerId,
      subtotal: total,
      total,
    },
    select: { id: true },
  });
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function createMember(name: string, document: string, withCustomer: boolean) {
  const member = await prisma.convenioMember.create({
    data: {
      tenantId,
      convenioId,
      name,
      document,
      selfieUrl: "qa/selfie.jpg",
      status: "ACTIVE",
      credentialTokenHash: `qa-${document}-${Date.now()}`,
      shortCode: document.slice(-6),
    },
    select: { id: true },
  });
  if (!withCustomer) return { memberId: member.id, customerId: null };

  const customer = await prisma.customer.create({
    data: { tenantId, name, convenioMemberId: member.id },
    select: { id: true },
  });
  return { memberId: member.id, customerId: customer.id };
}

beforeAll(async () => {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) {
    await prisma.sale.deleteMany({ where: { tenantId: previous.id } });
    await prisma.tenant.delete({ where: { id: previous.id } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Convênio Crédito",
      tradeName: "QA Convênio Crédito",
      document: `qa-cc-${Date.now()}`,
      phone: "(47) 3000-0002",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
      // O acréscimo que vale pro convênio é o da política, não o do tenant —
      // deixar o do tenant diferente prova que a política é que manda.
      creditoEficazSurchargePercent: 0,
    },
  });
  tenantId = tenant.id;

  const admin = await prisma.user.create({
    data: { tenantId, name: "Admin QA", email: `admin@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
  });
  adminId = admin.id;

  await prisma.cashRegister.create({ data: { tenantId, openedById: adminId, openingAmount: 0 } });

  const convenio = await prisma.convenio.create({
    data: {
      tenantId,
      name: "Havan QA",
      slug: `havan-qa-${Date.now()}`,
      rules: { benefitAmount: 0, requireProof: false, usesPerPeriod: 1, periodDays: 30 },
    },
    select: { id: true },
  });
  convenioId = convenio.id;

  const first = await createMember("Colaborador QA 1", `1111111${Date.now() % 10000}`, true);
  memberId = first.memberId;
  memberCustomerId = first.customerId!;

  const second = await createMember("Colaborador QA 2", `2222222${Date.now() % 10000}`, true);
  secondCustomerId = second.customerId!;

  const third = await createMember("Colaborador QA 3", `3333333${Date.now() % 10000}`, false);
  memberWithoutCustomerId = third.memberId;

  const manual = await prisma.customer.create({
    data: { tenantId, name: "Cliente QA fluxo normal" },
    select: { id: true },
  });
  manualCustomerId = manual.id;
});

afterAll(async () => {
  await prisma.sale.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
});

describe("Chave mestre — OFFLINE não faz nada", () => {
  it("1) sem política salva, ninguém recebe limite", async () => {
    const applied = await applyPolicyToApprovedMembers(tenantId, convenioId, adminId);
    expect(applied.granted).toBe(0);

    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(0);
    expect(summary?.source).toBe("MANUAL");
  });

  it("2) salvar a configuração DESLIGADA não concede nada", async () => {
    const result = await updateConvenioCreditPolicy(tenantId, convenioId, adminId, {
      enabled: false,
      defaultLimitAmount: 100,
      surchargePercent: 10,
      installmentCount: 2,
      installmentIntervalDays: 30,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.granted).toBe(0);

    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(0);
  });

  it("3) aprovar colaborador com a chave OFFLINE não concede nada", async () => {
    const granted = await grantConvenioCreditOnApproval(tenantId, convenioId, memberId, adminId);
    expect(granted).toBe("skipped");
    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(0);
  });
});

describe("Chave mestre — ONLINE concede e é idempotente", () => {
  it("4) ligar concede o limite inicial a quem já está aprovado", async () => {
    const result = await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { enabled: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.granted).toBe(2); // os dois com cadastro de cliente

    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(100);
    expect(summary?.availableAmount).toBe(100);
    expect(summary?.source).toBe("CONVENIO");
    expect(summary?.sourceConvenioName).toBe("Havan QA");
  });

  it("5) colaborador sem cadastro de cliente continua sem nada (nunca cria cliente sozinho)", async () => {
    const member = await prisma.convenioMember.findUniqueOrThrow({
      where: { id: memberWithoutCustomerId },
      select: { customer: { select: { id: true } } },
    });
    expect(member.customer).toBeNull();
  });

  it("6) cliente do fluxo normal não é tocado pelo convênio", async () => {
    const summary = await getCustomerCreditSummary(tenantId, manualCustomerId);
    expect(summary?.limitAmount).toBe(0);
    expect(summary?.source).toBe("MANUAL");
  });

  it("7) ligar de novo (e desligar/ligar) nunca concede duas vezes", async () => {
    const again = await applyPolicyToApprovedMembers(tenantId, convenioId, adminId);
    expect(again.granted).toBe(0);

    await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { enabled: false });
    const summaryAfterOff = await getCustomerCreditSummary(tenantId, memberCustomerId);
    // Desligar NUNCA retira limite de quem já recebeu.
    expect(summaryAfterOff?.limitAmount).toBe(100);

    const backOn = await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { enabled: true });
    expect(backOn.ok).toBe(true);
    if (backOn.ok) expect(backOn.granted).toBe(0);

    const changes = await prisma.creditoEficazLimitChange.count({
      where: { tenantId, customerId: memberCustomerId, reason: "CONVENIO_AUTO_GRANT" },
    });
    expect(changes).toBe(1);
  });

  it("8) limite decidido por humano nunca é sobrescrito pela regra automática", async () => {
    const manualMember = await createMember("Colaborador QA 4", `4444444${Date.now() % 10000}`, true);
    await setCreditLimit(tenantId, manualMember.customerId!, adminId, 500, "Análise manual");

    const granted = await grantConvenioCreditOnApproval(tenantId, convenioId, manualMember.memberId, adminId);
    expect(granted).toBe("skipped");

    const summary = await getCustomerCreditSummary(tenantId, manualMember.customerId!);
    expect(summary?.limitAmount).toBe(500);
    expect(summary?.source).toBe("MANUAL");
  });
});

describe("Condições de pagamento — 30 + 60 com 10%", () => {
  it("9) o cliente do convênio recebe acréscimo e parcelas da política", async () => {
    const terms = await resolveCustomerCreditTerms(tenantId, memberCustomerId);
    expect(terms.source).toBe("CONVENIO");
    expect(terms.surchargePercent).toBe(10);
    expect(terms.installmentCount).toBe(2);
    expect(terms.installmentIntervalDays).toBe(30);
  });

  it("10) o cliente do fluxo normal segue com o acréscimo do tenant e uma parcela", async () => {
    const terms = await resolveCustomerCreditTerms(tenantId, manualCustomerId);
    expect(terms.source).toBe("MANUAL");
    expect(terms.surchargePercent).toBe(0);
    expect(terms.installmentCount).toBe(1);
  });

  it("11) o exemplo do combinado: R$ 100 + 10% = R$ 110 em 2× de R$ 55 (30 e 60 dias)", () => {
    const plan = buildCreditoEficazInstallments(110, 2, 30, new Date());
    expect(plan.map((p) => p.amount)).toEqual([55, 55]);
    const hoje = new Date();
    const dias1 = Math.round((plan[0].dueDate.getTime() - hoje.getTime()) / 86400000);
    const dias2 = Math.round((plan[1].dueDate.getTime() - hoje.getTime()) / 86400000);
    expect(dias1).toBe(30);
    expect(dias2).toBe(60);
  });

  it("12) a compra parcelada debita o valor COM acréscimo de uma vez e gera uma obrigação por parcela", async () => {
    // Com limite de R$ 100, o que cabe é uma compra de R$ 50: o débito é
    // sobre os R$ 55 devidos (base + acréscimo), nunca sobre os R$ 50.
    const plan = buildCreditoEficazInstallments(55, 2, 30, new Date());
    expect(plan.map((p) => p.amount)).toEqual([27.5, 27.5]);

    const sale = await createFakeSale(memberCustomerId, 55);
    const usage = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: memberCustomerId,
        saleId: sale.id,
        operatorId: adminId,
        installments: plan.map((p) => ({ amount: p.amount, dueDate: p.dueDate })),
      })
    );
    expect(usage.ok).toBe(true);
    if (!usage.ok) return;
    expect(usage.usageIds).toHaveLength(2);

    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.availableAmount).toBe(45);
    expect(summary?.openAmount).toBe(55);
  });
});

describe("Recomposição, bônus e teto", () => {
  it("13) pagar parcela recompõe o limite disponível", async () => {
    const usage = await prisma.creditoEficazUsage.findFirstOrThrow({
      where: { tenantId, customerId: memberCustomerId, status: "OPEN" },
      orderBy: { installmentNumber: "asc" },
    });
    const paid = await registerManualPayment(tenantId, usage.id, adminId, 27.5, new Date(), "PIX");
    expect(paid.ok).toBe(true);

    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.availableAmount).toBe(72.5);
    expect(summary?.openAmount).toBe(27.5);
  });

  it("14) com o bônus DESLIGADO, pagar em dia não aumenta o limite", async () => {
    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(100);
    const bonuses = await prisma.creditoEficazLimitChange.count({
      where: { tenantId, customerId: memberCustomerId, reason: "PUNCTUALITY_BONUS" },
    });
    expect(bonuses).toBe(0);
  });

  it("15) com o bônus LIGADO, parcela paga em dia rende 50% em limite", async () => {
    await updateConvenioCreditPolicy(tenantId, convenioId, adminId, {
      bonusEnabled: true,
      bonusPercent: 50,
      autoLimitCap: 300,
    });

    const usage = await prisma.creditoEficazUsage.findFirstOrThrow({
      where: { tenantId, customerId: memberCustomerId, status: "OPEN" },
    });
    const paid = await registerManualPayment(tenantId, usage.id, adminId, 27.5, new Date(), "PIX");
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    // 50% de R$ 27,50 = R$ 13,75 de aumento permanente.
    expect(paid.bonus?.amount).toBe(13.75);

    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(113.75);
    // Recompôs a parcela paga e ainda somou o bônus ao disponível.
    expect(summary?.availableAmount).toBe(113.75);
  });

  it("16) parcela paga com ATRASO recompõe o limite mas não gera bônus", async () => {
    const sale = await createFakeSale(secondCustomerId, 50);
    const registered = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: secondCustomerId,
        saleId: sale.id,
        operatorId: adminId,
        installments: [{ amount: 50, dueDate: daysAgo(5) }],
      })
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    const limitBefore = (await getCustomerCreditSummary(tenantId, secondCustomerId))!.limitAmount;
    const paid = await registerManualPayment(tenantId, registered.usageIds[0], adminId, 50, new Date(), "PIX");
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.bonus).toBeNull();

    const summary = await getCustomerCreditSummary(tenantId, secondCustomerId);
    expect(summary?.limitAmount).toBe(limitBefore);
    expect(summary?.availableAmount).toBe(limitBefore);
  });

  it("17) o mesmo pagamento nunca gera dois bônus", async () => {
    const paidUsage = await prisma.creditoEficazUsage.findFirstOrThrow({
      where: { tenantId, customerId: memberCustomerId, status: "PAID" },
      orderBy: { createdAt: "desc" },
    });
    const bonuses = await prisma.creditoEficazLimitChange.count({
      where: { sourceUsageId: paidUsage.id, reason: "PUNCTUALITY_BONUS" },
    });
    expect(bonuses).toBeLessThanOrEqual(1);
  });

  it("18) o crescimento automático para no teto, mas o Admin pode passar dele", async () => {
    // Limite atual: R$ 113,75. Com teto em R$ 120, só cabem R$ 6,25.
    await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { autoLimitCap: 120 });

    const sale = await createFakeSale(memberCustomerId, 20);
    const registered = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: memberCustomerId,
        saleId: sale.id,
        operatorId: adminId,
        installments: [{ amount: 20, dueDate: new Date(Date.now() + 30 * 86400000) }],
      })
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    const paid = await registerManualPayment(tenantId, registered.usageIds[0], adminId, 20, new Date(), "PIX");
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    // 50% de 20 = 10, mas o teto de 120 só deixa entrar 6,25.
    expect(paid.bonus?.amount).toBe(6.25);
    expect(paid.bonus?.newLimit).toBe(120);

    // Teto atingido: o próximo pagamento pontual não rende mais nada.
    const sale2 = await createFakeSale(memberCustomerId, 20);
    const registered2 = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: memberCustomerId,
        saleId: sale2.id,
        operatorId: adminId,
        installments: [{ amount: 20, dueDate: new Date(Date.now() + 30 * 86400000) }],
      })
    );
    if (!registered2.ok) return;
    const paid2 = await registerManualPayment(tenantId, registered2.usageIds[0], adminId, 20, new Date(), "PIX");
    if (!paid2.ok) return;
    expect(paid2.bonus).toBeNull();

    // O teto é só do automático — o Admin passa dele à mão sem problema.
    const manualRaise = await setCreditLimit(tenantId, memberCustomerId, adminId, 400, "Decisão do Admin");
    expect(manualRaise.ok).toBe(true);
    const summary = await getCustomerCreditSummary(tenantId, memberCustomerId);
    expect(summary?.limitAmount).toBe(400);
  });
});

describe("Inadimplência", () => {
  it("19) parcela vencida em aberto bloqueia nova utilização sem apagar limite", async () => {
    const blocked = await createMember("Colaborador QA 5", `5555555${Date.now() % 10000}`, true);
    await grantConvenioCreditOnApproval(tenantId, convenioId, blocked.memberId, adminId);

    const sale = await createFakeSale(blocked.customerId!, 40);
    const registered = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: blocked.customerId!,
        saleId: sale.id,
        operatorId: adminId,
        installments: [{ amount: 40, dueDate: daysAgo(3) }],
      })
    );
    expect(registered.ok).toBe(true);

    const debit = await prisma.$transaction((tx) =>
      debitCreditoEficazInTx(tx, tenantId, blocked.customerId!, 10)
    );
    expect(debit.ok).toBe(false);
    if (!debit.ok) expect(debit.error).toContain("vencida");

    // O limite continua inteiro — só o uso novo é que fica travado.
    const summary = await getCustomerCreditSummary(tenantId, blocked.customerId!);
    expect(summary?.limitAmount).toBe(100);
    expect(summary?.blocked).toBe(false);

    // Regularizou, voltou a poder comprar.
    if (!registered.ok) return;
    await registerManualPayment(tenantId, registered.usageIds[0], adminId, 40, new Date(), "PIX");
    const afterPayment = await prisma.$transaction((tx) =>
      debitCreditoEficazInTx(tx, tenantId, blocked.customerId!, 10)
    );
    expect(afterPayment.ok).toBe(true);
  });

  it("20) com a regra desligada, atraso não bloqueia", async () => {
    await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { blockOnOverdue: false });
    const late = await createMember("Colaborador QA 6", `6666666${Date.now() % 10000}`, true);
    await grantConvenioCreditOnApproval(tenantId, convenioId, late.memberId, adminId);

    const sale = await createFakeSale(late.customerId!, 40);
    await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: late.customerId!,
        saleId: sale.id,
        operatorId: adminId,
        installments: [{ amount: 40, dueDate: daysAgo(3) }],
      })
    );

    const debit = await prisma.$transaction((tx) => debitCreditoEficazInTx(tx, tenantId, late.customerId!, 10));
    expect(debit.ok).toBe(true);
    await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { blockOnOverdue: true });
  });
});

describe("Alteração em massa", () => {
  it("21) a simulação mostra o impacto antes de qualquer escrita", async () => {
    const preview = await previewBulkLimitChange(tenantId, { kind: "CONVENIO", convenioId }, 150);
    expect(preview.affected).toBeGreaterThan(0);
    expect(preview.nextTotalLimit).toBe(Math.round(150 * preview.affected * 100) / 100);

    // Nada foi escrito: os limites continuam onde estavam.
    const summary = await getCustomerCreditSummary(tenantId, secondCustomerId);
    expect(summary?.limitAmount).not.toBe(150);
  });

  it("22) aplicar altera todos e deixa histórico com motivo", async () => {
    const result = await applyBulkLimitChange(
      tenantId,
      adminId,
      { kind: "CONVENIO", convenioId },
      150,
      "Ajuste de onda 1"
    );
    expect(result.ok).toBe(true);

    const summary = await getCustomerCreditSummary(tenantId, secondCustomerId);
    expect(summary?.limitAmount).toBe(150);

    const change = await prisma.creditoEficazLimitChange.findFirst({
      where: { tenantId, customerId: secondCustomerId, reason: "BULK_ADJUSTMENT" },
      orderBy: { createdAt: "desc" },
    });
    expect(change?.note).toBe("Ajuste de onda 1");
  });

  it("23) reduzir limite abaixo do usado NÃO mexe na dívida — só trava novas compras", async () => {
    const indebted = await createMember("Colaborador QA 7", `7777777${Date.now() % 10000}`, true);
    await grantConvenioCreditOnApproval(tenantId, convenioId, indebted.memberId, adminId);

    const sale = await createFakeSale(indebted.customerId!, 80);
    await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: indebted.customerId!,
        saleId: sale.id,
        operatorId: adminId,
        installments: [{ amount: 80, dueDate: new Date(Date.now() + 30 * 86400000) }],
      })
    );

    const before = await getCustomerCreditSummary(tenantId, indebted.customerId!);
    expect(before?.openAmount).toBe(80);

    const result = await applyBulkLimitChange(
      tenantId,
      adminId,
      { kind: "CUSTOMERS", customerIds: [indebted.customerId!] },
      20,
      "Redução de exposição"
    );
    expect(result.ok).toBe(true);

    const after = await getCustomerCreditSummary(tenantId, indebted.customerId!);
    expect(after?.limitAmount).toBe(20);
    // A dívida é exatamente a mesma de antes.
    expect(after?.openAmount).toBe(80);
    // Sem disponível: nova compra não passa.
    expect(after?.availableAmount).toBe(0);
    const debit = await prisma.$transaction((tx) =>
      debitCreditoEficazInTx(tx, tenantId, indebted.customerId!, 5)
    );
    expect(debit.ok).toBe(false);
  });
});

describe("Indicadores e campanha", () => {
  it("24) a exposição por convênio soma limites, dívida e bônus", async () => {
    const exposure = await getConvenioExposure(tenantId);
    const havan = exposure.find((item) => item.convenioId === convenioId);
    expect(havan).toBeDefined();
    expect(havan!.customers).toBeGreaterThan(0);
    expect(havan!.totalLimit).toBeGreaterThan(0);
    expect(havan!.averageLimit).toBeGreaterThan(0);
    expect(havan!.totalBonus).toBeGreaterThan(0);
  });

  it("25) a campanha só apura por ação explícita e com a chave ligada", async () => {
    const now = new Date();
    const referenceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const refused = await registerCampaignEntries(tenantId, convenioId, referenceMonth);
    expect(refused.ok).toBe(false);

    await updateConvenioCreditPolicy(tenantId, convenioId, adminId, { campaignEnabled: true });
    const eligible = await previewCampaignEligibility(tenantId, convenioId, referenceMonth);
    const registered = await registerCampaignEntries(tenantId, convenioId, referenceMonth);
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.entries).toBe(eligible.length);

    // Reapurar o mesmo mês nunca dá participação dobrada.
    const again = await registerCampaignEntries(tenantId, convenioId, referenceMonth);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.entries).toBe(0);

    const total = await prisma.creditoEficazCampaignEntry.count({ where: { tenantId } });
    expect(total).toBe(eligible.length);
  });
});
