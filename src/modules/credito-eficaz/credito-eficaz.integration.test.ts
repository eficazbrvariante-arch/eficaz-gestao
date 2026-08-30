/**
 * Testes de integração do motor de Crédito Eficaz (Protótipo 1) — cobrem os
 * cenários críticos que dependem de banco de verdade, sobretudo a
 * concorrência no débito do limite (pedido explícito: "duas vendas
 * simultâneas não podem gastar o mesmo limite"). Roda contra o banco
 * `dev-local`, mesmo padrão de `commission-ranking.integration.test.ts`
 * (fixture própria, tenant/usuário/cliente criados no `beforeAll`, só o
 * singleton de `@/lib/prisma`).
 *
 * A primeira metade testa o motor (`credito-eficaz-service.ts`) diretamente,
 * contra `Sale`s criadas manualmente só pra satisfazer a FK de
 * `CreditoEficazUsage.saleId`. A segunda metade ("integração real via
 * createSale/cancelSale") exercita o caminho de verdade do PDV (Fase 6):
 * `createSale` cobrando `CREDITO_EFICAZ` como forma de pagamento (PIN,
 * débito, criação da obrigação) e `cancelSale` estornando.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale, cancelSale } from "@/modules/sales/sale-service";
import { computeCatalogPrice } from "@/modules/products/catalog-price";
import {
  getRepairOrderFinancials,
  receiveRepairOrderPayment,
  deliverRepairOrder,
  grantRepairOrderCourtesy,
  cancelRepairOrderWithoutBilling,
  type RepairPaymentContext,
} from "@/modules/repairs/repair-payment-service";
import { updateRepairOrder } from "@/modules/repairs/repair-order-service";
import type { RepairOrderInput } from "@/lib/validations/repair-order";
import {
  getOrCreateDraftApplication,
  submitApplication,
  approveApplication,
  rejectApplication,
  blockCustomerCredit,
  unblockCustomerCredit,
  debitCreditoEficazInTx,
  recordCreditoEficazUsageInTx,
  reverseCreditoEficazUsageInTx,
  registerManualPayment,
  getCustomerCreditSummary,
  setCreditLimit,
  setCreditoEficazPin,
  setCreditoEficazExposureLimit,
  getExposureSummary,
  setCreditoEficazPaused,
  financeRepairOrderBalanceInTx,
  reverseServiceFinancingInTx,
  getCreditCohorts,
} from "./credito-eficaz-service";
import { currentMonthStartISO } from "@/lib/format";

const SUBDOMAIN = "qa-credito-eficaz-test";

let tenantId: string;
let otherTenantId: string;
let adminId: string;
let customerId: string;
let cashRegisterId: string;
let productId: string;
let saleCounter = 0;
let repairOrderCounter = 0;
const UNIT_PRICE = 100;

/** Cria uma `RepairOrder` mínima só pra satisfazer a FK única de `CreditoEficazServiceFinancing.repairOrderId`. */
async function createFakeRepairOrder(forTenantId: string, sellerId: string) {
  repairOrderCounter += 1;
  return prisma.repairOrder.create({
    data: {
      tenantId: forTenantId,
      number: 800000 + repairOrderCounter,
      sellerId,
      createdById: sellerId,
      brand: "QA",
      model: "Modelo de teste",
    },
    select: { id: true },
  });
}

/** Cria uma `RepairOrder` de verdade (com cliente e item cobrável) pra exercitar o
 *  fluxo real de pagamento (`receiveRepairOrderPayment`/`deliverRepairOrder`). */
async function createBillableRepairOrder(forCustomerId: string, sellerId: string, total: number) {
  repairOrderCounter += 1;
  return prisma.repairOrder.create({
    data: {
      tenantId,
      number: 810000 + repairOrderCounter,
      sellerId,
      customerId: forCustomerId,
      createdById: sellerId,
      brand: "QA",
      model: "Modelo de teste",
      items: { create: [{ description: "Serviço de teste", unitPrice: total, quantity: 1 }] },
    },
    select: { id: true },
  });
}

/** Cria uma `Sale` mínima só para satisfazer a FK única de `CreditoEficazUsage.saleId`. */
async function createFakeSale(forTenantId: string, sellerId: string, cashRegId: string, total: number) {
  saleCounter += 1;
  return prisma.sale.create({
    data: {
      tenantId: forTenantId,
      number: 900000 + saleCounter,
      cashRegisterId: cashRegId,
      sellerId,
      subtotal: total,
      total,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) {
    await prisma.sale.deleteMany({ where: { tenantId: previous.id } });
    await prisma.tenant.delete({ where: { id: previous.id } });
  }
  const previousOther = await prisma.tenant.findUnique({
    where: { subdomain: `${SUBDOMAIN}-other` },
    select: { id: true },
  });
  if (previousOther) await prisma.tenant.delete({ where: { id: previousOther.id } });

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Crédito Eficaz",
      tradeName: "QA Crédito Eficaz",
      document: `qa-ce-${Date.now()}`,
      phone: "(47) 3000-0000",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;

  const otherTenant = await prisma.tenant.create({
    data: {
      name: "QA Crédito Eficaz (outro tenant)",
      tradeName: "QA Crédito Eficaz B",
      document: `qa-ce-other-${Date.now()}`,
      phone: "(47) 3000-0001",
      subdomain: `${SUBDOMAIN}-other`,
      email: `admin@${SUBDOMAIN}-other.qa.test`,
    },
  });
  otherTenantId = otherTenant.id;

  const admin = await prisma.user.create({
    data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
  });
  adminId = admin.id;

  const customer = await prisma.customer.create({
    data: { tenantId, name: "Cliente QA Crédito Eficaz", eficazNumber: "EF-000001" },
  });
  customerId = customer.id;

  const cashRegister = await prisma.cashRegister.create({
    data: { tenantId, openedById: adminId, openingAmount: 0 },
  });
  cashRegisterId = cashRegister.id;

  const [category, supplier] = await Promise.all([
    prisma.category.create({ data: { tenantId, name: "Categoria QA Crédito Eficaz" } }),
    prisma.supplier.create({ data: { tenantId, name: "Fornecedor QA Crédito Eficaz", phone: "(11) 3000-0000" } }),
  ]);
  const product = await prisma.product.create({
    data: {
      tenantId,
      name: "Produto QA Crédito Eficaz",
      internalCode: `QA-CE-${Date.now()}`,
      barcode: `QACE${Date.now()}`,
      categoryId: category.id,
      supplierId: supplier.id,
      costPrice: 10,
      salePrice: UNIT_PRICE,
      catalogPrice: computeCatalogPrice(UNIT_PRICE, null),
      stockQty: 100000,
      minStock: 5,
      active: true,
      showInCatalog: true,
    },
  });
  productId = product.id;
});

function saleItems(quantity: number) {
  return [{ productId, variantId: "", quantity, discount: 0 }];
}

describe("Crédito Eficaz — solicitação e aprovação", () => {
  it("1) cliente sem crédito aprovado não tem saldo disponível", async () => {
    const summary = await getCustomerCreditSummary(tenantId, customerId);
    expect(summary?.limitAmount).toBe(0);
    expect(summary?.availableAmount).toBe(0);

    const debit = await prisma.$transaction((tx) => debitCreditoEficazInTx(tx, tenantId, customerId, 10));
    expect(debit.ok).toBe(false);
  });

  it("2) solicitação enviada sem documentos é rejeitada com erro claro", async () => {
    const draft = await getOrCreateDraftApplication(tenantId, customerId);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const result = await submitApplication(tenantId, customerId, draft.application.id, "v1");
    expect(result.ok).toBe(false);
  });

  it("3) aprovação define o limite e reflete no resumo do cliente", async () => {
    const draft = await getOrCreateDraftApplication(tenantId, customerId);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    await prisma.creditoEficazDocument.createMany({
      data: [
        { tenantId, applicationId: draft.application.id, type: "ID_DOCUMENT", blobPathname: "qa/id.jpg" },
        { tenantId, applicationId: draft.application.id, type: "RESIDENCE_PROOF", blobPathname: "qa/proof.jpg" },
        { tenantId, applicationId: draft.application.id, type: "SELFIE", blobPathname: "qa/selfie.jpg" },
      ],
    });

    const submitted = await submitApplication(tenantId, customerId, draft.application.id, "v1");
    expect(submitted.ok).toBe(true);

    const approved = await approveApplication(tenantId, draft.application.id, adminId, 200, "Aprovado no teste");
    expect(approved.ok).toBe(true);

    const summary = await getCustomerCreditSummary(tenantId, customerId);
    expect(summary?.limitAmount).toBe(200);
    expect(summary?.availableAmount).toBe(200);
    expect(summary?.usedAmount).toBe(0);

    const applicationAfter = await prisma.creditoEficazApplication.findUniqueOrThrow({
      where: { id: draft.application.id },
    });
    expect(applicationAfter.status).toBe("APPROVED");
  });

  it("4) não é possível aprovar a mesma solicitação duas vezes", async () => {
    const application = await prisma.creditoEficazApplication.findFirstOrThrow({
      where: { tenantId, customerId, status: "APPROVED" },
    });
    const result = await approveApplication(tenantId, application.id, adminId, 500);
    expect(result.ok).toBe(false);
  });

  it("5) recusa exige motivo e nunca mexe no limite", async () => {
    const draft = await getOrCreateDraftApplication(tenantId, customerId);
    // já existe uma solicitação APPROVED ativa — deve bloquear nova
    expect(draft.ok).toBe(false);

    // Simula recusa numa solicitação separada de outro cliente, sem afetar o limite já aprovado do cliente principal.
    const otherCustomer = await prisma.customer.create({ data: { tenantId, name: "Cliente QA Recusado" } });
    const application = await prisma.creditoEficazApplication.create({
      data: { tenantId, customerId: otherCustomer.id, status: "UNDER_REVIEW" },
    });
    const rejected = await rejectApplication(tenantId, application.id, adminId, "Documentos inconsistentes");
    expect(rejected.ok).toBe(true);

    const summary = await getCustomerCreditSummary(tenantId, otherCustomer.id);
    expect(summary?.limitAmount).toBe(0);
  });
});

describe("Crédito Eficaz — uso, bloqueio, estorno e pagamento", () => {
  it("6) venda abaixo do limite debita corretamente", async () => {
    const sale = await createFakeSale(tenantId, adminId, cashRegisterId, 50);
    const result = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: sale.id,
        amount: 50,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(result.ok).toBe(true);

    const summary = await getCustomerCreditSummary(tenantId, customerId);
    expect(summary?.availableAmount).toBe(150);
    expect(summary?.usedAmount).toBe(50);
  });

  it("7) venda exatamente no limite disponível passa; acima do limite é rejeitada", async () => {
    const exactSale = await createFakeSale(tenantId, adminId, cashRegisterId, 150);
    const exact = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: exactSale.id,
        amount: 150,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(exact.ok).toBe(true);

    const summaryAfterExact = await getCustomerCreditSummary(tenantId, customerId);
    expect(summaryAfterExact?.availableAmount).toBe(0);

    const overSale = await createFakeSale(tenantId, adminId, cashRegisterId, 1);
    const over = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: overSale.id,
        amount: 1,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(over.ok).toBe(false);

    const summaryAfterOver = await getCustomerCreditSummary(tenantId, customerId);
    expect(summaryAfterOver?.availableAmount).toBe(0);
  });

  it("8) bloqueio impede novo uso mesmo com saldo disponível; desbloqueio libera de novo", async () => {
    // Devolve o limite pra ter saldo disponível de novo antes de testar o bloqueio.
    const raised = await setCreditLimit(tenantId, customerId, adminId, 400, "Aumento pro teste de bloqueio");
    expect(raised.ok).toBe(true);
    const summaryBefore = await getCustomerCreditSummary(tenantId, customerId);
    expect(summaryBefore?.availableAmount).toBeGreaterThan(0);

    await blockCustomerCredit(tenantId, customerId, "Atraso — teste QA");
    const blockedSale = await createFakeSale(tenantId, adminId, cashRegisterId, 10);
    const blockedResult = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: blockedSale.id,
        amount: 10,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(blockedResult.ok).toBe(false);

    await unblockCustomerCredit(tenantId, customerId);
    const unblockedSale = await createFakeSale(tenantId, adminId, cashRegisterId, 10);
    const unblockedResult = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: unblockedSale.id,
        amount: 10,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(unblockedResult.ok).toBe(true);
  });

  it("9) estorno de venda devolve o limite e marca a obrigação como cancelada", async () => {
    const summaryBefore = await getCustomerCreditSummary(tenantId, customerId);
    const sale = await createFakeSale(tenantId, adminId, cashRegisterId, 30);
    await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: sale.id,
        amount: 30,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );

    await prisma.$transaction((tx) => reverseCreditoEficazUsageInTx(tx, tenantId, sale.id));

    const summaryAfter = await getCustomerCreditSummary(tenantId, customerId);
    expect(summaryAfter?.availableAmount).toBe(summaryBefore?.availableAmount);

    const usage = await prisma.creditoEficazUsage.findUniqueOrThrow({ where: { saleId: sale.id } });
    expect(usage.status).toBe("CANCELLED");
  });

  it("10) pagamento parcial e integral recompõem o disponível e fecham a obrigação", async () => {
    const raised = await setCreditLimit(tenantId, customerId, adminId, 1000, "Reset pro teste de pagamento");
    expect(raised.ok).toBe(true);
    const sale = await createFakeSale(tenantId, adminId, cashRegisterId, 300);
    const usageResult = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId,
        saleId: sale.id,
        amount: 300,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(usageResult.ok).toBe(true);
    if (!usageResult.ok) return;

    const partial = await registerManualPayment(tenantId, usageResult.usageId, adminId, 100, new Date(), "PIX");
    expect(partial.ok).toBe(true);

    const usageAfterPartial = await prisma.creditoEficazUsage.findUniqueOrThrow({
      where: { id: usageResult.usageId },
    });
    expect(usageAfterPartial.status).toBe("OPEN");

    const full = await registerManualPayment(tenantId, usageResult.usageId, adminId, 200, new Date(), "PIX");
    expect(full.ok).toBe(true);

    const usageAfterFull = await prisma.creditoEficazUsage.findUniqueOrThrow({
      where: { id: usageResult.usageId },
    });
    expect(usageAfterFull.status).toBe("PAID");

    const overpay = await registerManualPayment(tenantId, usageResult.usageId, adminId, 1, new Date(), "PIX");
    expect(overpay.ok).toBe(false);
  });

  it("11) duas 'vendas' concorrentes disputando o mesmo limite — só uma pode passar", async () => {
    // Cliente próprio, com limite recém-aprovado e intocado — evita qualquer
    // dependência do "usado" acumulado pelos testes anteriores (que já pode
    // ser maior que o limite justo que este teste precisa).
    const concurrencyCustomer = await prisma.customer.create({
      data: { tenantId, name: "Cliente QA Concorrência" },
    });
    const limitResult = await setCreditLimit(tenantId, concurrencyCustomer.id, adminId, 100, "Limite pro teste de concorrência");
    expect(limitResult.ok).toBe(true);

    const [saleA, saleB] = await Promise.all([
      createFakeSale(tenantId, adminId, cashRegisterId, 100),
      createFakeSale(tenantId, adminId, cashRegisterId, 100),
    ]);

    const [resultA, resultB] = await Promise.all([
      prisma.$transaction((tx) =>
        recordCreditoEficazUsageInTx(tx, {
          tenantId,
          customerId: concurrencyCustomer.id,
          saleId: saleA.id,
          amount: 100,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          operatorId: adminId,
        })
      ),
      prisma.$transaction((tx) =>
        recordCreditoEficazUsageInTx(tx, {
          tenantId,
          customerId: concurrencyCustomer.id,
          saleId: saleB.id,
          amount: 100,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          operatorId: adminId,
        })
      ),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.ok);
    const failed = [resultA, resultB].filter((r) => !r.ok);
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const summary = await getCustomerCreditSummary(tenantId, concurrencyCustomer.id);
    expect(summary?.availableAmount).toBe(0);
  });
});

describe("Crédito Eficaz — isolamento multi-tenant", () => {
  it("12) não é possível aprovar ou bloquear crédito de cliente de outro tenant", async () => {
    const draft = await prisma.creditoEficazApplication.create({
      data: { tenantId, customerId, status: "UNDER_REVIEW" },
    });

    const approveFromOtherTenant = await approveApplication(otherTenantId, draft.id, adminId, 999);
    expect(approveFromOtherTenant.ok).toBe(false);

    const blockFromOtherTenant = await blockCustomerCredit(otherTenantId, customerId, "tentativa de outro tenant");
    expect(blockFromOtherTenant.ok).toBe(false);

    // limpeza: essa solicitação de teste fica pendente de propósito, não afeta os outros testes (customerId já tem outra decisão em UNDER_REVIEW não é permitido por getOrCreateDraftApplication, mas os testes acima não recriam draft depois deste ponto).
  });
});

describe("Crédito Eficaz — integração real via createSale/cancelSale (Fase 6)", () => {
  async function newApprovedCustomer(name: string, limit: number, pin: string) {
    const customer = await prisma.customer.create({ data: { tenantId, name } });
    const approved = await setCreditLimit(tenantId, customer.id, adminId, limit, "Setup de teste");
    expect(approved.ok).toBe(true);
    const pinResult = await setCreditoEficazPin(tenantId, customer.id, pin);
    expect(pinResult.ok).toBe(true);
    return customer.id;
  }

  it("13) venda no PDV com Crédito Eficaz e PIN correto debita o limite e cria a obrigação", async () => {
    const buyerId = await newApprovedCustomer("Cliente QA PDV Crédito Eficaz", 500, "1234");

    const result = await createSale(
      {
        tenantId,
        sellerId: adminId,
        cashRegisterId,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: adminId,
      },
      {
        customerId: buyerId,
        sellerId: adminId,
        items: saleItems(1),
        payments: [{ method: "CREDITO_EFICAZ", amount: UNIT_PRICE }],
        creditoEficazPin: "1234",
      } as never
    );
    expect(result.ok).toBe(true);

    const summary = await getCustomerCreditSummary(tenantId, buyerId);
    expect(summary?.availableAmount).toBe(500 - UNIT_PRICE);

    if (result.ok) {
      const usage = await prisma.creditoEficazUsage.findUniqueOrThrow({ where: { saleId: result.saleId } });
      expect(Number(usage.amount)).toBe(UNIT_PRICE);
      expect(usage.status).toBe("OPEN");
    }
  });

  it("14) PIN incorreto rejeita a venda e não debita nada", async () => {
    const buyerId = await newApprovedCustomer("Cliente QA PIN Errado", 500, "1234");

    const result = await createSale(
      {
        tenantId,
        sellerId: adminId,
        cashRegisterId,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: adminId,
      },
      {
        customerId: buyerId,
        sellerId: adminId,
        items: saleItems(1),
        payments: [{ method: "CREDITO_EFICAZ", amount: UNIT_PRICE }],
        creditoEficazPin: "0000",
      } as never
    );
    expect(result.ok).toBe(false);

    const summary = await getCustomerCreditSummary(tenantId, buyerId);
    expect(summary?.availableAmount).toBe(500);
  });

  it("15) estorno de venda com Crédito Eficaz devolve o limite", async () => {
    const buyerId = await newApprovedCustomer("Cliente QA Estorno", 500, "1234");

    const result = await createSale(
      {
        tenantId,
        sellerId: adminId,
        cashRegisterId,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: adminId,
      },
      {
        customerId: buyerId,
        sellerId: adminId,
        items: saleItems(1),
        payments: [{ method: "CREDITO_EFICAZ", amount: UNIT_PRICE }],
        creditoEficazPin: "1234",
      } as never
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const afterSale = await getCustomerCreditSummary(tenantId, buyerId);
    expect(afterSale?.availableAmount).toBe(500 - UNIT_PRICE);

    const cancelled = await cancelSale(tenantId, result.saleId, adminId, "Estorno QA — teste de Crédito Eficaz", buyerId);
    expect(cancelled.ok).toBe(true);

    const afterCancel = await getCustomerCreditSummary(tenantId, buyerId);
    expect(afterCancel?.availableAmount).toBe(500);

    const usage = await prisma.creditoEficazUsage.findUniqueOrThrow({ where: { saleId: result.saleId } });
    expect(usage.status).toBe("CANCELLED");
  });

  it("16) duas vendas reais concorrentes no PDV disputando o mesmo limite — só uma pode passar", async () => {
    const buyerId = await newApprovedCustomer("Cliente QA Concorrência PDV", UNIT_PRICE, "1234");

    const ctx = {
      tenantId,
      sellerId: adminId,
      cashRegisterId,
      allowDiscount: true,
      allowFreeDiscount: true,
      allowFiado: true,
      operatorId: adminId,
    };
    const input = {
      customerId: buyerId,
      sellerId: adminId,
      items: saleItems(1),
      payments: [{ method: "CREDITO_EFICAZ", amount: UNIT_PRICE }],
      creditoEficazPin: "1234",
    };

    const [resultA, resultB] = await Promise.all([
      createSale(ctx, input as never),
      createSale(ctx, input as never),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.ok);
    expect(succeeded.length).toBe(1);

    const summary = await getCustomerCreditSummary(tenantId, buyerId);
    expect(summary?.availableAmount).toBe(0);
  });
});

describe("Crédito Eficaz — Adendo: pausa, teto global e financiamento de OS", () => {
  it("17) pausa de emergência bloqueia novo débito, sem apagar nada", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA Pausa", 500, "1234");
    const paused = await setCreditoEficazPaused(tenantId, true);
    expect(paused.ok).toBe(true);

    const sale = await createFakeSale(tenantId, adminId, cashRegisterId, 50);
    const result = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: buyerId,
        saleId: sale.id,
        amount: 50,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(result.ok).toBe(false);

    const unpaused = await setCreditoEficazPaused(tenantId, false);
    expect(unpaused.ok).toBe(true);
    const sale2 = await createFakeSale(tenantId, adminId, cashRegisterId, 50);
    const result2 = await prisma.$transaction((tx) =>
      recordCreditoEficazUsageInTx(tx, {
        tenantId,
        customerId: buyerId,
        saleId: sale2.id,
        amount: 50,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        operatorId: adminId,
      })
    );
    expect(result2.ok).toBe(true);
  });

  it("18) teto global rejeita débito que ultrapassaria, mas aceita o que não ultrapassa", async () => {
    const buyerA = await newApprovedCustomerHelper("Cliente QA Teto A", 300, "1234");
    const buyerB = await newApprovedCustomerHelper("Cliente QA Teto B", 300, "1234");

    // O tenant é compartilhado por todos os testes deste arquivo — a
    // exposição já acumulada pelos testes anteriores conta. O teto aqui é
    // relativo a ela (baseline + 100), não um valor absoluto fixo.
    const baseline = await getExposureSummary(tenantId);
    const limitSet = await setCreditoEficazExposureLimit(tenantId, round2(baseline.totalUsed + 100));
    expect(limitSet.ok).toBe(true);

    try {
      const saleA = await createFakeSale(tenantId, adminId, cashRegisterId, 100);
      const resultA = await prisma.$transaction((tx) =>
        recordCreditoEficazUsageInTx(tx, {
          tenantId,
          customerId: buyerA,
          saleId: saleA.id,
          amount: 100,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          operatorId: adminId,
        })
      );
      expect(resultA.ok).toBe(true);

      // Já usou os 100 de folga do teto — próxima utilização, mesmo de
      // outro cliente com limite disponível de sobra, tem que ser recusada.
      const saleB = await createFakeSale(tenantId, adminId, cashRegisterId, 50);
      const resultB = await prisma.$transaction((tx) =>
        recordCreditoEficazUsageInTx(tx, {
          tenantId,
          customerId: buyerB,
          saleId: saleB.id,
          amount: 50,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          operatorId: adminId,
        })
      );
      expect(resultB.ok).toBe(false);
    } finally {
      // `finally` garante que o teto some mesmo se uma asserção falhar
      // acima — nunca deixa vazar pros testes seguintes deste arquivo.
      await setCreditoEficazExposureLimit(tenantId, null);
    }
  });

  it("19) financiar o saldo de uma OS gera N parcelas e debita o valor certo", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA Financiamento OS", 1000, "1234");
    const repairOrder = await createFakeRepairOrder(tenantId, adminId);

    const dueDates = [30, 60, 90].map((days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000));
    const result = await prisma.$transaction((tx) =>
      financeRepairOrderBalanceInTx(tx, {
        tenantId,
        customerId: buyerId,
        repairOrderId: repairOrder.id,
        totalAmount: 320,
        downPayment: 100,
        installments: [
          { amount: 73.34, dueDate: dueDates[0] },
          { amount: 73.33, dueDate: dueDates[1] },
          { amount: 73.33, dueDate: dueDates[2] },
        ],
        createdById: adminId,
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usageIds.length).toBe(3);

    const summary = await getCustomerCreditSummary(tenantId, buyerId);
    expect(summary?.availableAmount).toBe(round2(1000 - 220));

    const financing = await prisma.creditoEficazServiceFinancing.findUniqueOrThrow({
      where: { id: result.financingId },
    });
    expect(Number(financing.financedAmount)).toBe(220);
    expect(financing.installmentCount).toBe(3);

    const usages = await prisma.creditoEficazUsage.findMany({ where: { financingId: result.financingId } });
    expect(usages.length).toBe(3);
    expect(usages.every((u) => u.status === "OPEN")).toBe(true);
    expect(usages.map((u) => u.installmentNumber).sort()).toEqual([1, 2, 3]);
  });

  it("20) cortesia com financiamento ativo devolve só a fatia ainda não paga", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA Cortesia OS", 500, "1234");
    const repairOrder = await createFakeRepairOrder(tenantId, adminId);

    const result = await prisma.$transaction((tx) =>
      financeRepairOrderBalanceInTx(tx, {
        tenantId,
        customerId: buyerId,
        repairOrderId: repairOrder.id,
        totalAmount: 150,
        downPayment: 0,
        installments: [
          { amount: 75, dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
          { amount: 75, dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
        ],
        createdById: adminId,
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Paga a primeira parcela integralmente antes da cortesia — essa não
    // deve ser devolvida; só a segunda (ainda em aberto) é revertida.
    const paid = await registerManualPayment(tenantId, result.usageIds[0], adminId, 75, new Date(), "PIX");
    expect(paid.ok).toBe(true);

    const summaryBeforeCourtesy = await getCustomerCreditSummary(tenantId, buyerId);

    await prisma.$transaction((tx) => reverseServiceFinancingInTx(tx, tenantId, repairOrder.id));

    const summaryAfterCourtesy = await getCustomerCreditSummary(tenantId, buyerId);
    expect(round2(summaryAfterCourtesy!.availableAmount - summaryBeforeCourtesy!.availableAmount)).toBe(75);

    const usages = await prisma.creditoEficazUsage.findMany({
      where: { financingId: result.financingId },
      orderBy: { installmentNumber: "asc" },
    });
    expect(usages[0].status).toBe("PAID");
    expect(usages[1].status).toBe("CANCELLED");
  });
});

describe("Crédito Eficaz — Adendo: Assistência Técnica, fluxo real (Fase 5)", () => {
  function paymentCtx(): RepairPaymentContext {
    return { tenantId, userId: adminId, cashRegisterId, allowFiado: true };
  }

  it("21) financiar o saldo de uma OS via receiveRepairOrderPayment fecha o saldo na hora e gera as parcelas", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA OS Pagamento", 1000, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 300);

    const result = await receiveRepairOrderPayment(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 300 }],
      { creditoEficazPin: "1234", creditoEficazInstallments: 3 }
    );
    expect(result.ok).toBe(true);

    const financials = await getRepairOrderFinancials(tenantId, repairOrder.id);
    expect(financials?.balance).toBe(0);
    expect(financials?.situation).toBe("QUITADO");
    expect(financials?.payments.some((p) => p.method === "CREDITO_EFICAZ")).toBe(true);

    const financing = await prisma.creditoEficazServiceFinancing.findUniqueOrThrow({
      where: { repairOrderId: repairOrder.id },
    });
    expect(Number(financing.financedAmount)).toBe(300);
    expect(Number(financing.downPayment)).toBe(0);

    const usages = await prisma.creditoEficazUsage.findMany({ where: { financingId: financing.id } });
    expect(usages.length).toBe(3);
    expect(usages.every((u) => u.status === "OPEN")).toBe(true);
  });

  it("22) PIN incorreto no acerto financeiro da OS rejeita e não financia nada", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA OS PIN Errado", 500, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 200);

    const result = await receiveRepairOrderPayment(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 200 }],
      { creditoEficazPin: "0000" }
    );
    expect(result.ok).toBe(false);

    const financials = await getRepairOrderFinancials(tenantId, repairOrder.id);
    expect(financials?.balance).toBe(200);
    const financing = await prisma.creditoEficazServiceFinancing.findUnique({
      where: { repairOrderId: repairOrder.id },
    });
    expect(financing).toBeNull();
  });

  it("23) entrega com saldo restante financiado via Crédito Eficaz também fecha e entrega a OS", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA OS Entrega", 500, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 150);

    const result = await deliverRepairOrder(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 150 }],
      { creditoEficazPin: "1234", creditoEficazInstallments: 1 }
    );
    expect(result.ok).toBe(true);

    const order = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrder.id } });
    expect(order.status).toBe("DELIVERED");
    const financials = await getRepairOrderFinancials(tenantId, repairOrder.id);
    expect(financials?.situation).toBe("QUITADO");
  });

  it("24) cortesia numa OS financiada perdoa as parcelas em aberto sem mexer no faturamento já fechado", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA OS Cortesia Real", 500, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 200);

    const financed = await receiveRepairOrderPayment(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 200 }],
      { creditoEficazPin: "1234", creditoEficazInstallments: 2 }
    );
    expect(financed.ok).toBe(true);

    const summaryBefore = await getCustomerCreditSummary(tenantId, buyerId);

    const courtesy = await grantRepairOrderCourtesy(
      { tenantId, userId: adminId },
      repairOrder.id,
      "Cliente reclamou do serviço"
    );
    expect(courtesy.ok).toBe(true);

    const summaryAfter = await getCustomerCreditSummary(tenantId, buyerId);
    expect(round2(summaryAfter!.availableAmount - summaryBefore!.availableAmount)).toBe(200);

    const usages = await prisma.creditoEficazUsage.findMany({
      where: { financingId: (await prisma.creditoEficazServiceFinancing.findUniqueOrThrow({ where: { repairOrderId: repairOrder.id } })).id },
    });
    expect(usages.every((u) => u.status === "CANCELLED")).toBe(true);

    // O faturamento da OS não muda — o pagamento em Crédito Eficaz continua
    // valendo como recebido; cortesia aqui perdoa a dívida do cliente, não o
    // que a loja já registrou como faturado.
    const financials = await getRepairOrderFinancials(tenantId, repairOrder.id);
    expect(financials?.situation).toBe("QUITADO");
  });

  it("25) updateRepairOrder recusa editar itens/desconto quando há financiamento de Crédito Eficaz ativo", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA OS Edição Bloqueada", 500, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 200);

    const financed = await receiveRepairOrderPayment(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 200 }],
      { creditoEficazPin: "1234" }
    );
    expect(financed.ok).toBe(true);

    const input: RepairOrderInput = {
      customerId: buyerId,
      sellerId: adminId,
      brand: "QA",
      model: "Modelo alterado",
      turnsOn: true,
      discount: 0,
      items: [{ description: "Serviço de teste", unitPrice: 200, quantity: 1 }],
      photoUrls: [],
    };
    const result = await updateRepairOrder(tenantId, repairOrder.id, input, {
      canWriteCostAlways: true,
      canWriteCostIfUnset: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/financiamento de Crédito Eficaz ativo/);
  });

  it("26) cancelRepairOrderWithoutBilling continua recusando quando há Crédito Eficaz registrado (regressão)", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA OS Cancelamento Bloqueado", 500, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 100);

    const financed = await receiveRepairOrderPayment(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 100 }],
      { creditoEficazPin: "1234" }
    );
    expect(financed.ok).toBe(true);

    const result = await cancelRepairOrderWithoutBilling(
      { tenantId, userId: adminId },
      repairOrder.id,
      adminId,
      "Cliente desistiu"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/pagamento registrado/);
  });

  it("27) safra agrupa clientes aprovados e utilização no mês certo de aprovação", async () => {
    const buyerId = await newApprovedCustomerHelper("Cliente QA Safra", 400, "1234");
    const repairOrder = await createBillableRepairOrder(buyerId, adminId, 120);
    const financed = await receiveRepairOrderPayment(
      paymentCtx(),
      repairOrder.id,
      [{ method: "CREDITO_EFICAZ", amount: 120 }],
      { creditoEficazPin: "1234" }
    );
    expect(financed.ok).toBe(true);

    const currentMonthISO = currentMonthStartISO();
    const cohorts = await getCreditCohorts(tenantId);
    const currentCohort = cohorts.find((c) => c.monthStartISO === currentMonthISO);
    expect(currentCohort).toBeDefined();
    expect(currentCohort!.approvedCustomers).toBeGreaterThan(0);
    expect(currentCohort!.totalUsed).toBeGreaterThanOrEqual(120);
  });
});

async function newApprovedCustomerHelper(name: string, limit: number, pin: string) {
  const customer = await prisma.customer.create({ data: { tenantId, name } });
  const approved = await setCreditLimit(tenantId, customer.id, adminId, limit, "Setup de teste (Adendo)");
  if (!approved.ok) throw new Error(approved.error);
  const pinResult = await setCreditoEficazPin(tenantId, customer.id, pin);
  if (!pinResult.ok) throw new Error(pinResult.error);
  return customer.id;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
