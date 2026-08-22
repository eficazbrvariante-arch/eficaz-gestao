/**
 * Etapa B da Auditoria Mestra — teste de concorrência de estoque, o mais
 * importante desta rodada. `docs/auditoria-estoque-preco.md` já confirmou por
 * leitura de código que `createSale`/`createOrder` fazem `decrement` cego,
 * sem checar `stockQty` disponível. Este teste dispara vendas concorrentes de
 * verdade contra o banco `dev-local` para confirmar (ou não) esse diagnóstico
 * com dados reais — SEM alterar a lógica de produção.
 *
 * Pré-requisito: rode `npm run qa:multitenant:seed` antes desta suíte.
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createSale } from "@/modules/sales/sale-service";
import { createOrder } from "@/modules/orders/order-service";
import { loadQaTenant, resetLastUnitStock, SUBDOMAIN_A, SUBDOMAIN_B } from "./qa-fixtures";

let a: Awaited<ReturnType<typeof loadQaTenant>>;
let b: Awaited<ReturnType<typeof loadQaTenant>>;

beforeAll(async () => {
  a = await loadQaTenant(SUBDOMAIN_A);
  b = await loadQaTenant(SUBDOMAIN_B);
});

describe("Etapa B — concorrência de estoque (produto com stockQty = 1)", () => {
  it("PDV x PDV simultâneos na última unidade — registra quantas das 3 rodadas terminam com estoque negativo", async () => {
    let negativeRounds = 0;
    const finalValues: number[] = [];

    for (let round = 1; round <= 3; round++) {
      await resetLastUnitStock(a.productLastUnit.id, 1);

      const ctx = {
        tenantId: a.tenant.id,
        cashRegisterId: a.cashRegister.id,
        allowDiscount: true,
        allowFreeDiscount: true,
        allowFiado: true,
      };

      const [resultAdmin, resultSeller] = await Promise.all([
        createSale(
          { ...ctx, sellerId: a.admin.id, operatorId: a.admin.id },
          {
            sellerId: a.admin.id,
            items: [{ productId: a.productLastUnit.id, variantId: "", quantity: 1, discount: 0 }],
            payments: [{ method: "CASH", amount: 100 }],
            cashReceived: 100,
          } as never
        ),
        createSale(
          { ...ctx, sellerId: a.seller.id, operatorId: a.seller.id },
          {
            sellerId: a.seller.id,
            items: [{ productId: a.productLastUnit.id, variantId: "", quantity: 1, discount: 0 }],
            payments: [{ method: "CASH", amount: 100 }],
            cashReceived: 100,
          } as never
        ),
      ]);

      const finalProduct = await prisma.product.findUniqueOrThrow({
        where: { id: a.productLastUnit.id },
        select: { stockQty: true },
      });
      finalValues.push(finalProduct.stockQty);
      if (finalProduct.stockQty < 0) negativeRounds++;

      console.log(
        `[PDV x PDV] rodada ${round}: venda admin ${resultAdmin.ok ? "OK" : "REJEITADA"}, ` +
          `venda vendedora ${resultSeller.ok ? "OK" : "REJEITADA"}, stockQty final = ${finalProduct.stockQty}`
      );
    }

    console.log(`[PDV x PDV] resultado final das 3 rodadas: ${JSON.stringify(finalValues)}`);
    console.log(
      `[PDV x PDV] rodadas com estoque negativo: ${negativeRounds}/3 — ` +
        "resultado REAL registrado em docs/testes-multitenant.md, não corrigido no código."
    );

    // Este `expect` documenta o comportamento observado — não é um teste que
    // "deveria" passar hoje. Se `sale-service.ts` for corrigido no futuro
    // (ver docs/plano-correcao.md, item P0 #1), a expectativa vira
    // `toBeGreaterThanOrEqual(0)` outra vez.
    expect(finalValues.length).toBe(3);
  });

  it("PDV x Pedido online (DEDUCT) simultâneos na última unidade — registra o resultado real", async () => {
    let negativeRounds = 0;
    const finalValues: number[] = [];

    for (let round = 1; round <= 3; round++) {
      await resetLastUnitStock(b.productLastUnit.id, 1);

      const salePromise = createSale(
        {
          tenantId: b.tenant.id,
          sellerId: b.seller.id,
          cashRegisterId: b.cashRegister.id,
          allowDiscount: true,
          allowFreeDiscount: true,
          allowFiado: true,
          operatorId: b.seller.id,
        },
        {
          sellerId: b.seller.id,
          items: [{ productId: b.productLastUnit.id, variantId: "", quantity: 1, discount: 0 }],
          payments: [{ method: "CASH", amount: 100 }],
          cashReceived: 100,
        } as never
      );

      const uniqueSuffix = crypto.randomUUID().slice(0, 8);
      const orderPromise = createOrder(
        b.tenant.id,
        {
          customerName: "Cliente Concorrência QA",
          customerPhone: "(47) 90000-0000",
          customerEmail: "",
          customerDocument: "",
          fulfillment: "PICKUP",
          deliveryZoneId: "",
          addressStreet: "",
          addressNumber: "",
          addressComplement: "",
          addressNeighborhood: "",
          addressCity: "",
          addressState: "",
          addressZip: "",
          paymentMethod: "CASH",
          changeFor: undefined,
          notes: "Pedido concorrência QA",
          items: [{ productId: b.productLastUnit.id, variantId: "", quantity: 1 }],
          auth: { authMode: "register", username: `qaconc_${uniqueSuffix}`, password: "QaTeste@2026" },
        } as never,
        { mode: "register", username: `qaconc_${uniqueSuffix}`, password: "QaTeste@2026" }
      );

      const [resultSale, resultOrder] = await Promise.all([salePromise, orderPromise]);

      const finalProduct = await prisma.product.findUniqueOrThrow({
        where: { id: b.productLastUnit.id },
        select: { stockQty: true },
      });
      finalValues.push(finalProduct.stockQty);
      if (finalProduct.stockQty < 0) negativeRounds++;

      console.log(
        `[PDV x Pedido online] rodada ${round}: venda PDV ${resultSale.ok ? "OK" : "REJEITADA"}, ` +
          `pedido online ${resultOrder.ok ? "OK" : "REJEITADA"}, stockQty final = ${finalProduct.stockQty}`
      );
    }

    console.log(`[PDV x Pedido online] resultado final das 3 rodadas: ${JSON.stringify(finalValues)}`);
    console.log(`[PDV x Pedido online] rodadas com estoque negativo: ${negativeRounds}/3`);

    expect(finalValues.length).toBe(3);
  });
});
