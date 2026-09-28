/**
 * Testes de integração de `setInitialProductPrice` — primeiro preço de um
 * produto cadastrado sem preço, definido no PDV uma vez só.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { setInitialProductPrice } from "./initial-price";

const SUBDOMAIN = "qa-initial-price-test";

let tenantId: string;
let productCounter = 0;

async function cleanup() {
  const previous = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN }, select: { id: true } });
  if (previous) await prisma.tenant.delete({ where: { id: previous.id } });
}

function createProduct(salePrice: number, promoPrice: number | null = null) {
  productCounter += 1;
  return prisma.product.create({
    data: {
      tenantId,
      name: `Produto QA ${productCounter}`,
      internalCode: `QA-IP-${Date.now()}-${productCounter}`,
      costPrice: 10,
      salePrice,
      promoPrice,
      catalogPrice: promoPrice ?? salePrice,
      stockQty: 5,
      active: true,
      showInCatalog: false,
    },
  });
}

beforeAll(async () => {
  await cleanup();
  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Primeiro Preço",
      tradeName: "QA Primeiro Preço",
      document: `qa-ip-${Date.now()}`,
      phone: "(47) 3000-0005",
      subdomain: SUBDOMAIN,
      email: `admin@${SUBDOMAIN}.qa.test`,
    },
  });
  tenantId = tenant.id;
});

afterAll(cleanup);

describe("setInitialProductPrice", () => {
  it("grava o preço de um produto sem preço", async () => {
    const product = await createProduct(0);
    const result = await setInitialProductPrice(tenantId, product.id, 49.9);

    expect(result).toMatchObject({ ok: true, price: 49.9 });
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updated.salePrice)).toBe(49.9);
    expect(Number(updated.catalogPrice)).toBeGreaterThan(0);
  });

  it("não deixa definir de novo: só vale uma vez", async () => {
    const product = await createProduct(0);
    await setInitialProductPrice(tenantId, product.id, 30);
    const second = await setInitialProductPrice(tenantId, product.id, 5);

    expect(second.ok).toBe(false);
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updated.salePrice)).toBe(30);
  });

  it("recusa produto que já tem preço ou promoção", async () => {
    const withPrice = await createProduct(25);
    const withPromo = await createProduct(0, 19.9);

    expect((await setInitialProductPrice(tenantId, withPrice.id, 10)).ok).toBe(false);
    expect((await setInitialProductPrice(tenantId, withPromo.id, 10)).ok).toBe(false);
  });

  it("recusa preço zero ou negativo", async () => {
    const product = await createProduct(0);
    expect((await setInitialProductPrice(tenantId, product.id, 0)).ok).toBe(false);
    expect((await setInitialProductPrice(tenantId, product.id, -5)).ok).toBe(false);
  });

  it("dois caixas ao mesmo tempo: só o primeiro grava", async () => {
    const product = await createProduct(0);
    const results = await Promise.all([
      setInitialProductPrice(tenantId, product.id, 40),
      setInitialProductPrice(tenantId, product.id, 45),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
