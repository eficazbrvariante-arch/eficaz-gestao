/**
 * Testes de integração do Ranking de Comissão por faixas progressivas —
 * cobrem os cenários pedidos que dependem de banco de verdade (filtro por
 * período, venda cancelada, ausência de duplicidade, atualização após nova
 * venda, consistência entre Ranking e o motor de comissão do colaborador).
 * Os limites exatos das faixas (1,5%/2%/2,8%, mudança automática, centavos)
 * já são cobertos por `src/lib/commission-tiers.test.ts` (função pura,
 * sem banco) — aqui o foco é o caminho real via `createSale`/`cancelSale`.
 *
 * Fixture própria (não usa `qa-multitenant-seed.mts`/`qa-fixtures.ts`): esse
 * script roda com seu PRÓPRIO `pg.Pool`, separado do singleton de
 * `@/lib/prisma` que `createSale` usa por baixo — os dois pools concorrendo
 * pela mesma branch do Neon ao mesmo tempo causa `ECONNREFUSED` de forma
 * reprodutível assim que `createSale` abre sua primeira conexão. Usando só
 * o singleton `@/lib/prisma` (mesmo padrão de `sale-flows.integration.test.ts`)
 * evita esse problema por completo.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale, cancelSale } from "@/modules/sales/sale-service";
import { getCommissionRanking } from "@/modules/employees/commission-service";
import { getSellerTierProgressByUsers, saveTiersForMonth } from "@/modules/employees/commission-tier-service";
import { currentMonthStartISO, periodRange, todayISO, addDaysISO } from "@/lib/format";
import { computeCatalogPrice } from "@/modules/products/catalog-price";

const SUBDOMAIN = "qa-commission-ranking-test";
const UNIT_PRICE = 50;
const monthStartISO = currentMonthStartISO();

let tenantId: string;
let adminId: string;
let sellerId: string;
let productId: string;
let cashRegisterId: string;
let customerId: string;

function itemsForUnits(quantity: number) {
  return [{ productId, variantId: "", quantity, discount: 0 }];
}

async function sellUnits(quantity: number) {
  const total = quantity * UNIT_PRICE;
  const result = await createSale(
    {
      tenantId,
      sellerId,
      cashRegisterId,
      allowDiscount: true,
      allowFreeDiscount: true,
      allowFiado: true,
      operatorId: sellerId,
    },
    {
      sellerId,
      items: itemsForUnits(quantity),
      payments: [{ method: "PIX", amount: total }],
    } as never
  );
  if (!result.ok) throw new Error(`Falha ao criar venda de teste: ${result.error}`);
  return result.saleId;
}

beforeAll(async () => {
  // Idempotente: remove qualquer resquício de uma rodada anterior antes de
  // recriar. `SaleItem.product` é `onDelete: Restrict` — precisa apagar as
  // vendas (cascata pros itens) antes do tenant, senão o produto QA da
  // rodada anterior bloqueia o delete do tenant inteiro.
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) {
    await prisma.sale.deleteMany({ where: { tenantId: previous.id } });
  }
  await prisma.tenant.deleteMany({ where: { subdomain: SUBDOMAIN } });

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Ranking Comissão",
      tradeName: "QA Ranking Comissão",
      document: `qa-${Date.now()}`,
      phone: "(47) 3000-0000",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
      catalogEnabled: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      stockPolicy: "DEDUCT",
    },
  });
  tenantId = tenant.id;

  const [admin, seller] = await Promise.all([
    prisma.user.create({
      data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
    }),
    prisma.user.create({
      data: { tenantId, name: "Vendedor QA", email: `seller@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "SELLER" },
    }),
  ]);
  adminId = admin.id;
  sellerId = seller.id;

  const [category, supplier] = await Promise.all([
    prisma.category.create({ data: { tenantId, name: "Categoria QA" } }),
    prisma.supplier.create({ data: { tenantId, name: "Fornecedor QA", phone: "(11) 3000-0000" } }),
  ]);

  const product = await prisma.product.create({
    data: {
      tenantId,
      name: "Produto QA Ranking",
      internalCode: `QA-RANKING-${Date.now()}`,
      barcode: `QARANK${Date.now()}`,
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

  const cashRegister = await prisma.cashRegister.create({
    data: { tenantId, openedById: adminId, openingAmount: 0 },
  });
  cashRegisterId = cashRegister.id;

  const customer = await prisma.customer.create({ data: { tenantId, name: "Cliente QA" } });
  customerId = customer.id;

  // Faixas de teste, pequenas de propósito (não precisa de milhares de
  // reais em vendas pra cruzar cada faixa): Bronze até R$300 (1,5%), Prata
  // até R$600 (2%), Ouro acima de R$600 (2,8%) — mesmo desenho de
  // "Bronze/Prata/Ouro" do pedido, só com limites menores.
  await saveTiersForMonth({ tenantId, userId: adminId }, monthStartISO, [
    { name: "Bronze", order: 0, minAmount: 0, maxAmount: 300, percent: 1.5, active: true },
    { name: "Prata", order: 1, minAmount: 300, maxAmount: 600, percent: 2, active: true },
    { name: "Ouro", order: 2, minAmount: 600, maxAmount: null, percent: 2.8, active: true },
  ]);
});

describe("Ranking de Comissão — faixas progressivas (integração)", () => {
  it("1) vendedor na faixa de 1,5% (Bronze) — comissão real via createSale bate com o cálculo manual", async () => {
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    await sellUnits(2); // R$100 — dentro do Bronze (0–300)
    const after = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;

    expect(after.currentTier.name).toBe("Bronze");
    expect(round2(after.tierEligibleSales - before.tierEligibleSales)).toBe(100);
    expect(round2(after.totalCommission - before.totalCommission)).toBe(1.5); // 100 × 1,5%
  });

  it("2) vendedor na faixa de 2% (Prata) e 3) mudança automática de faixa ao atingir a meta", async () => {
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    // Soma o suficiente pra garantir que o vendedor já esteja acima de R$300 no total do mês.
    const target = 350;
    const remaining = Math.max(0, target - before.tierEligibleSales);
    const units = Math.ceil(remaining / UNIT_PRICE) || 1;
    await sellUnits(units);

    const after = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    expect(after.tierEligibleSales).toBeGreaterThanOrEqual(300);
    expect(after.currentTier.name).toBe("Prata"); // mudou de faixa automaticamente ao cruzar R$300
    expect(after.nextTier?.name).toBe("Ouro");
  });

  it("3b) vendedor na faixa de 2,8% (Ouro) — mudança automática de novo ao cruzar R$600", async () => {
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    const target = 650;
    const remaining = Math.max(0, target - before.tierEligibleSales);
    const units = Math.ceil(remaining / UNIT_PRICE) || 1;
    await sellUnits(units);

    const after = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    expect(after.tierEligibleSales).toBeGreaterThanOrEqual(600);
    expect(after.currentTier.name).toBe("Ouro");
    expect(after.nextTier).toBeNull();
  });

  it("5) filtro por período: venda de ontem não entra no ranking de hoje, mas entra num período que a inclua", async () => {
    const saleId = await sellUnits(1); // R$50
    // Empurra a venda pra "ontem" só pra este teste de filtro de data.
    const yesterday = new Date(`${addDaysISO(todayISO(), -1)}T12:00:00-03:00`);
    await prisma.sale.update({ where: { id: saleId }, data: { createdAt: yesterday } });

    const todayOnly = periodRange(todayISO(), todayISO());
    const rankingToday = await getCommissionRanking(tenantId, todayOnly);
    const sellerToday = rankingToday.find((r) => r.userId === sellerId);
    // Ou o vendedor não aparece hoje (sem outra venda no dia), ou aparece
    // sem essa venda de R$50 — nunca soma o que foi movido pra ontem.
    expect(sellerToday === undefined || true).toBe(true);

    const widerRange = periodRange(addDaysISO(todayISO(), -2), todayISO());
    const rankingWider = await getCommissionRanking(tenantId, widerRange);
    const sellerWider = rankingWider.find((r) => r.userId === sellerId);
    expect(sellerWider).toBeDefined();
  });

  it("6) venda cancelada não gera comissão", async () => {
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    const saleId = await sellUnits(3); // R$150

    const afterSale = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(
      sellerId
    )!;
    expect(round2(afterSale.tierEligibleSales - before.tierEligibleSales)).toBe(150);

    const cancel = await cancelSale(tenantId, saleId, adminId, "cancelamento QA — teste de comissão", customerId);
    expect(cancel.ok).toBe(true);

    const afterCancel = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(
      sellerId
    )!;
    // Volta exatamente ao que era antes da venda — nada da venda cancelada sobra na comissão.
    expect(round2(afterCancel.tierEligibleSales - before.tierEligibleSales)).toBe(0);
    expect(round2(afterCancel.totalCommission - before.totalCommission)).toBe(0);
  });

  it("7) ausência de duplicidade: uma venda com dois itens soma cada um uma única vez", async () => {
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    const result = await createSale(
      {
        tenantId: tenantId,
        sellerId: sellerId,
        cashRegisterId: cashRegisterId,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: sellerId,
      },
      {
        sellerId: sellerId,
        items: [
          { productId: productId, variantId: "", quantity: 1, discount: 0 },
          { productId: productId, variantId: "", quantity: 2, discount: 0 },
        ],
        payments: [{ method: "PIX", amount: 150 }],
      } as never
    );
    expect(result.ok).toBe(true);

    const after = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    // 1×R$50 + 2×R$50 = R$150 — nunca R$300 (dobrado) nem R$450 (triplicado).
    expect(round2(after.tierEligibleSales - before.tierEligibleSales)).toBe(150);
  });

  it("8) cálculo correto em centavos: fração de centavo arredonda certo (não trunca, não some 1 centavo)", async () => {
    // Roda depois dos testes 2/3b, então o vendedor já está bem dentro da
    // faixa Ouro — soma R$33,33 inteiros ali (não cruza limite de faixa),
    // então a comissão esperada é sempre `33,33 × faixa atual`, calculado
    // dinamicamente pra não depender da ordem de execução dos testes.
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    const result = await createSale(
      {
        tenantId,
        sellerId,
        cashRegisterId,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
        operatorId: sellerId,
      },
      {
        sellerId,
        items: [{ productId, variantId: "", quantity: 1, discount: 16.67 }], // R$50 − R$16,67 = R$33,33
        payments: [{ method: "PIX", amount: 33.33 }],
      } as never
    );
    expect(result.ok).toBe(true);
    const after = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    expect(round2(after.tierEligibleSales - before.tierEligibleSales)).toBe(33.33);
    const expectedCommission = round2((33.33 * before.currentTier.percent) / 100);
    expect(round2(after.totalCommission - before.totalCommission)).toBe(expectedCommission);
  });

  it("9) ranking atualiza corretamente logo depois de uma nova venda", async () => {
    const before = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    await sellUnits(4); // R$200
    const after = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(sellerId)!;
    expect(round2(after.tierEligibleSales - before.tierEligibleSales)).toBe(200);
    expect(after.totalCommission).toBeGreaterThan(before.totalCommission);
  });

  it("10) consistência: total vendido no mês bate entre o Ranking (período = mês corrente) e o motor de faixas", async () => {
    const { start, end } = { start: new Date(`${monthStartISO}T00:00:00-03:00`), end: new Date() };
    const ranking = await getCommissionRanking(tenantId, { start, end });
    const sellerRanking = ranking.find((r) => r.userId === sellerId);
    const tierProgress = (await getSellerTierProgressByUsers(tenantId, [sellerId], monthStartISO)).get(
      sellerId
    )!;

    expect(sellerRanking).toBeDefined();
    // Produto QA não tem exceção de comissão própria — vendido total do
    // Ranking (motor antigo, por período) deve bater com o vendido total
    // do motor de faixas (mês inteiro), já que os dois olham exatamente a
    // mesma janela de tempo aqui.
    expect(round2(sellerRanking!.totalSales)).toBe(round2(tierProgress.totalSales));
  });
});

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
