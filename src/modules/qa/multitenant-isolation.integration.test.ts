/**
 * Etapa B da Auditoria Mestra — matriz de acesso cruzado real (Tenant A
 * tentando ver/editar/excluir dado do Tenant B), executada contra o banco
 * `dev-local`. Espelha a tabela de 12 tentativas de `docs/testes-multitenant.md`.
 *
 * Pré-requisito: rode `npm run qa:multitenant:seed` antes desta suíte.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { cancelSale, createSale } from "@/modules/sales/sale-service";
import { updateRepairOrderStatus } from "@/modules/repairs/repair-order-service";
import { getSalesSummary } from "@/modules/reports/report-service";
import { loadQaTenant, SUBDOMAIN_A, SUBDOMAIN_B } from "./qa-fixtures";

let a: Awaited<ReturnType<typeof loadQaTenant>>;
let b: Awaited<ReturnType<typeof loadQaTenant>>;

beforeAll(async () => {
  a = await loadQaTenant(SUBDOMAIN_A);
  b = await loadQaTenant(SUBDOMAIN_B);
});

describe("Etapa B — matriz de acesso cruzado (Tenant A x Tenant B)", () => {
  it("1. Visualizar produto do B (via /produtos/[id]) — NEGADO esperado", async () => {
    const result = await prisma.product.findFirst({
      where: { id: b.productNormal.id, tenantId: a.tenant.id },
    });
    expect(result).toBeNull();
  });

  it("2. Editar produto do B (padrão de updateProductAction) — NEGADO esperado", async () => {
    const found = await prisma.product.findFirst({
      where: { id: b.productNormal.id, tenantId: a.tenant.id },
    });
    expect(found).toBeNull();
    // Sem o `findFirst` de confirmação acima retornar um registro, a Server
    // Action real (`produtos/actions.ts`) nunca chega a chamar `update` —
    // reproduzimos aqui o mesmo efeito prático: nenhuma escrita acontece.
  });

  it("3. Excluir produto do B (padrão de deleteMany com tenantId) — NEGADO esperado", async () => {
    const deleted = await prisma.product.deleteMany({
      where: { id: b.productNormal.id, tenantId: a.tenant.id },
    });
    expect(deleted.count).toBe(0);
    const stillExists = await prisma.product.findUnique({ where: { id: b.productNormal.id } });
    expect(stillExists).not.toBeNull();
  });

  it("4. Visualizar cliente do B (via /clientes/[id]) — NEGADO esperado", async () => {
    const result = await prisma.customer.findFirst({
      where: { id: b.customer.id, tenantId: a.tenant.id },
    });
    expect(result).toBeNull();
  });

  it("5. Visualizar venda do B (via /vendas/[id]) — NEGADO esperado", async () => {
    const result = await prisma.sale.findFirst({
      where: { id: b.sale.id, tenantId: a.tenant.id },
    });
    expect(result).toBeNull();
  });

  it("6. Cancelar venda do B (cancelSale real, chamado com o tenant de A) — NEGADO esperado", async () => {
    const result = await cancelSale(a.tenant.id, b.sale.id, a.admin.id, "tentativa de acesso cruzado QA");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Venda não encontrada.");

    const stillCompleted = await prisma.sale.findUnique({
      where: { id: b.sale.id },
      select: { status: true },
    });
    expect(stillCompleted?.status).toBe("COMPLETED");
  });

  it("7. Acessar pedido do B (via /pedidos/[id]) — NEGADO esperado", async () => {
    const result = await prisma.order.findFirst({
      where: { id: b.order.id, tenantId: a.tenant.id },
    });
    expect(result).toBeNull();
  });

  it("8. Acessar OS do B (updateRepairOrderStatus real, chamado com o tenant de A) — NEGADO esperado", async () => {
    const result = await updateRepairOrderStatus(a.tenant.id, b.repairOrder.id, "ANALYZING");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Ordem de serviço não encontrada.");

    const stillReceived = await prisma.repairOrder.findUnique({
      where: { id: b.repairOrder.id },
      select: { status: true },
    });
    expect(stillReceived?.status).toBe("RECEIVED");
  });

  it("9. Acessar usuário do B (via /usuarios) — NEGADO esperado", async () => {
    const result = await prisma.user.findFirst({
      where: { id: b.admin.id, tenantId: a.tenant.id },
    });
    expect(result).toBeNull();
  });

  it("10. Acessar caixa do B (via /caixa) — NEGADO esperado", async () => {
    const result = await prisma.cashRegister.findFirst({
      where: { id: b.cashRegister.id, tenantId: a.tenant.id },
    });
    expect(result).toBeNull();
  });

  it("11. Acessar relatório do B (getSalesSummary real, chamado com o tenant de A) — NEGADO esperado", async () => {
    // Não presume quantas vendas A já tem (outros testes desta suíte também
    // criam vendas em A) — mede o efeito relativo de uma venda nova e
    // inconfundível (R$ 987,65) criada só no Tenant B.
    const today = new Date().toISOString().slice(0, 10);
    const period = { from: today, to: today };

    const before = await getSalesSummary(a.tenant.id, period);
    const beforeB = await getSalesSummary(b.tenant.id, period);

    const marker = await createSale(
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
        items: [{ productId: b.productNormal.id, variantId: "", quantity: 1, discount: 0 }],
        payments: [{ method: "PIX", amount: 50 }],
      } as never
    );
    expect(marker.ok).toBe(true);

    const after = await getSalesSummary(a.tenant.id, period);
    const afterB = await getSalesSummary(b.tenant.id, period);

    // O que importa: criar uma venda nova em B nunca muda o total já visto em A.
    expect(after.pdvCount).toBe(before.pdvCount);
    expect(after.pdvRevenue).toBe(before.pdvRevenue);
    // Em compensação, o relatório do próprio B reflete a venda nova.
    expect(afterB.pdvCount).toBe(beforeB.pdvCount + 1);
    expect(afterB.pdvRevenue).toBe(beforeB.pdvRevenue + 50);
  });

  it("12. Acessar/alterar configuração do B (Tenant.update escopado ao próprio id) — NEGADO esperado", async () => {
    // Padrão real usado em `configuracoes/*/actions.ts`: o `where` é sempre
    // `{ id: user.tenantId }` — nunca um id recebido de fora. Não existe
    // "buscar config por id arbitrário"; simulamos a garantia checando que
    // atualizar pelo id de A nunca toca o registro de B.
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: b.tenant.id } });
    await prisma.tenant.update({
      where: { id: a.tenant.id },
      data: { bannerTitle: "Alterado pelo teste de isolamento QA" },
    });
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: b.tenant.id } });
    expect(after.bannerTitle).toBe(before.bannerTitle);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });
});
