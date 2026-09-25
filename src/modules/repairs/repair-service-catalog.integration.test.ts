/**
 * Catálogo de serviços da assistência — roda contra o banco `dev-local`
 * (mesmo padrão de `credito-eficaz.integration.test.ts`). Cobre o que só dá
 * para provar com banco de verdade: quem pode gravar custo/fornecedor, o
 * custo congelado na OS (editar o catálogo depois não muda OS antiga) e o
 * isolamento entre tenants.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRepairOrder, updateRepairOrder } from "./repair-order-service";
import {
  createRepairService,
  repairOrderTotalCost,
  searchRepairServices,
  setRepairServiceActive,
  updateRepairService,
} from "./repair-service-catalog";
import type { RepairOrderInput } from "@/lib/validations/repair-order";

const SUBDOMAIN = "qa-catalogo-servicos-test";

let tenantId: string;
let otherTenantId: string;
let adminId: string;
let customerId: string;
let supplierId: string;

async function removeTenant(subdomain: string) {
  const previous = await prisma.tenant.findUnique({ where: { subdomain }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });
}

function orderInput(items: RepairOrderInput["items"]): RepairOrderInput {
  return {
    customerId,
    sellerId: adminId,
    brand: "QA",
    model: "Modelo de teste",
    turnsOn: true,
    discount: 0,
    costPrice: 20,
    items,
    photoUrls: [],
  };
}

beforeAll(async () => {
  await removeTenant(SUBDOMAIN);
  await removeTenant(`${SUBDOMAIN}-other`);

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Catálogo de Serviços",
      tradeName: "QA Catálogo de Serviços",
      document: `qa-cs-${Date.now()}`,
      phone: "(47) 3000-0000",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;

  const other = await prisma.tenant.create({
    data: {
      name: "QA Catálogo (outro tenant)",
      tradeName: "QA Catálogo B",
      document: `qa-cs-other-${Date.now()}`,
      phone: "(47) 3000-0001",
      subdomain: `${SUBDOMAIN}-other`,
      email: `admin@${SUBDOMAIN}-other.qa.test`,
    },
  });
  otherTenantId = other.id;

  const admin = await prisma.user.create({
    data: { tenantId, name: "Admin QA", email: `admin2@${SUBDOMAIN}.qa.test`, passwordHash: "qa", role: "ADMIN" },
  });
  adminId = admin.id;

  const customer = await prisma.customer.create({ data: { tenantId, name: "Cliente QA Catálogo" } });
  customerId = customer.id;

  const supplier = await prisma.supplier.create({ data: { tenantId, name: "Fornecedor QA Catálogo" } });
  supplierId = supplier.id;
});

afterAll(async () => {
  await removeTenant(SUBDOMAIN);
  await removeTenant(`${SUBDOMAIN}-other`);
});

describe("catálogo de serviços da assistência", () => {
  it("quem não pode ver custo cadastra só nome e preço", async () => {
    const result = await createRepairService(
      tenantId,
      { name: "Troca de conector", price: 90, costPrice: 30, supplierId },
      { canSetCost: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = await prisma.repairService.findUniqueOrThrow({ where: { id: result.service.id } });
    expect(saved.costPrice).toBeNull();
    expect(saved.supplierId).toBeNull();
    expect(result.service.costPrice).toBeNull();
  });

  it("não deixa dois serviços com o mesmo nome (ignorando maiúsculas)", async () => {
    const result = await createRepairService(
      tenantId,
      { name: "TROCA DE CONECTOR", price: 100 },
      { canSetCost: true }
    );
    expect(result.ok).toBe(false);
  });

  it("recusa fornecedor de outro tenant", async () => {
    const foreign = await prisma.supplier.create({ data: { tenantId: otherTenantId, name: "Fornecedor B" } });
    const result = await createRepairService(
      tenantId,
      { name: "Troca de bateria", price: 150, costPrice: 60, supplierId: foreign.id },
      { canSetCost: true }
    );
    expect(result.ok).toBe(false);
  });

  it("congela o custo na OS: mudar o catálogo depois não mexe na OS antiga", async () => {
    const created = await createRepairService(
      tenantId,
      { name: "Troca de tela", price: 300, costPrice: 120, supplierId },
      { canSetCost: true }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const serviceId = created.service.id;

    const order = await createRepairOrder(
      { tenantId, userId: adminId },
      orderInput([
        { description: "Troca de tela", unitPrice: 300, quantity: 1, repairServiceId: serviceId },
        { description: "Limpeza (avulso)", unitPrice: 30, quantity: 1 },
      ]),
      { canSetCost: true }
    );
    expect(order.ok).toBe(true);
    if (!order.ok) return;

    const loadItems = () =>
      prisma.repairOrderItem.findMany({
        where: { repairOrderId: order.id },
        select: { description: true, repairServiceId: true, unitCost: true, quantity: true },
        orderBy: { description: "asc" },
      });

    let items = await loadItems();
    expect(items.find((i) => i.description === "Troca de tela")?.unitCost?.toString()).toBe("120");
    expect(items.find((i) => i.description === "Limpeza (avulso)")?.unitCost).toBeNull();
    expect(repairOrderTotalCost(20, items)).toBe(140);

    // Admin sobe o custo no catálogo; a OS é salva de novo (a edição recria as linhas).
    const edited = await updateRepairService(tenantId, serviceId, {
      name: "Troca de tela",
      price: 320,
      costPrice: 150,
      supplierId,
    });
    expect(edited.ok).toBe(true);

    const resaved = await updateRepairOrder(
      tenantId,
      order.id,
      orderInput([
        { description: "Troca de tela", unitPrice: 300, quantity: 1, repairServiceId: serviceId },
        { description: "Limpeza (avulso)", unitPrice: 30, quantity: 1 },
      ]),
      { canWriteCostAlways: true, canWriteCostIfUnset: true }
    );
    expect(resaved.ok).toBe(true);
    items = await loadItems();
    expect(items.find((i) => i.description === "Troca de tela")?.unitCost?.toString()).toBe("120");

    // Uma segunda linha do mesmo serviço, nova, pega o custo atual do catálogo.
    await updateRepairOrder(
      tenantId,
      order.id,
      orderInput([
        { description: "Troca de tela", unitPrice: 300, quantity: 1, repairServiceId: serviceId },
        { description: "Troca de tela (2º aparelho)", unitPrice: 320, quantity: 1, repairServiceId: serviceId },
      ]),
      { canWriteCostAlways: true, canWriteCostIfUnset: true }
    );
    items = await loadItems();
    const costs = items.map((i) => i.unitCost?.toString()).sort();
    expect(costs).toEqual(["120", "150"]);
  });

  it("ignora serviço de outro tenant na OS (sem vínculo e sem custo)", async () => {
    const foreign = await prisma.repairService.create({
      data: { tenantId: otherTenantId, name: "Serviço B", price: 50, costPrice: 40 },
    });
    const order = await createRepairOrder(
      { tenantId, userId: adminId },
      orderInput([{ description: "Serviço B", unitPrice: 50, quantity: 1, repairServiceId: foreign.id }]),
      { canSetCost: true }
    );
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const [item] = await prisma.repairOrderItem.findMany({ where: { repairOrderId: order.id } });
    expect(item.repairServiceId).toBeNull();
    expect(item.unitCost).toBeNull();
  });

  it("busca: sem custo para quem não pode ver, e desativado some da busca", async () => {
    const withoutCost = await searchRepairServices(tenantId, "tela", { withCost: false });
    expect(withoutCost).toHaveLength(1);
    expect(withoutCost[0].costPrice).toBeNull();
    expect(withoutCost[0].supplier).toBeNull();

    const withCost = await searchRepairServices(tenantId, "tela", { withCost: true });
    expect(withCost[0].costPrice).toBe(150);

    await setRepairServiceActive(tenantId, withCost[0].id, false);
    expect(await searchRepairServices(tenantId, "tela", { withCost: true })).toHaveLength(0);
    expect(
      await searchRepairServices(tenantId, "tela", { withCost: true, includeInactive: true })
    ).toHaveLength(1);
  });
});
