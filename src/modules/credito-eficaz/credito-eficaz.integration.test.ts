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
} from "./credito-eficaz-service";

const SUBDOMAIN = "qa-credito-eficaz-test";

let tenantId: string;
let otherTenantId: string;
let adminId: string;
let customerId: string;
let cashRegisterId: string;
let productId: string;
let saleCounter = 0;
const UNIT_PRICE = 100;

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
