/**
 * Reset de movimentação para começar testes práticos do zero: cancela todos
 * os pedidos do catálogo online, apaga todo o histórico de vendas e caixa, e
 * zera fiado/crédito de loja de todos os clientes.
 *
 * PRESERVADO: empresa (Tenant), usuários, produtos, categorias, clientes
 * (cadastro) e configurações. Só o movimento financeiro/estoque é resetado.
 *
 * Estoque: itens de vendas concluídas e de pedidos que já haviam baixado
 * estoque voltam para a quantidade atual do produto/variante — mesma lógica
 * de `cancelSale`/`revertStockDeduction` usada no cancelamento normal pela UI.
 *
 * Usa `pg` diretamente (SQL puro), sem passar pelo Prisma Client: no momento
 * da escrita deste script, o Prisma Client (adapter-pg + gerador
 * "prisma-client") está falhando com ECONNREFUSED em qualquer script rodado
 * via `tsx` neste ambiente (Node 24), mesmo em código já existente antes
 * desta mudança — bug de ambiente não relacionado a este script, ainda não
 * corrigido. A conexão `pg` crua foi testada e funciona normalmente.
 *
 * Uso:
 *   npx tsx scripts/reset-vendas-pedidos.mts              → só mostra o que seria feito
 *   npx tsx scripts/reset-vendas-pedidos.mts --confirmar  → executa de verdade
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { Client } from "pg";

/** Este banco tem mais de uma empresa cadastrada — o reset é só para a loja real. */
const TARGET_SUBDOMAIN = "eficazbr";

const confirmado = process.argv.includes("--confirmar");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows: tenants } = await client.query<{ id: string; name: string; subdomain: string }>(
    `SELECT id, name, subdomain FROM tenants WHERE subdomain = $1`,
    [TARGET_SUBDOMAIN]
  );
  if (tenants.length === 0) {
    console.error(`Nenhuma empresa com subdomínio "${TARGET_SUBDOMAIN}" encontrada. Nada a fazer.`);
    process.exit(1);
  }
  const tenant = tenants[0];
  const tenantId = tenant.id;

  const { rows: pedidosPorStatus } = await client.query(
    `SELECT status, COUNT(*)::int AS quantidade FROM orders WHERE "tenantId" = $1 GROUP BY status`,
    [tenantId]
  );
  // pg.Client não suporta queries concorrentes no mesmo client — roda em sequência.
  const { rows: vendasRows } = await client.query(`SELECT COUNT(*)::int AS n FROM sales WHERE "tenantId" = $1`, [
    tenantId,
  ]);
  const { rows: vendasConcluidasRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM sales WHERE "tenantId" = $1 AND status = 'COMPLETED'`,
    [tenantId]
  );
  const { rows: fiadoRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM fiado_entries WHERE "tenantId" = $1`,
    [tenantId]
  );
  const { rows: creditoMovsRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM customer_credit_movements WHERE "tenantId" = $1`,
    [tenantId]
  );
  const { rows: clientesComCreditoRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM customers WHERE "tenantId" = $1 AND "creditBalance" <> 0`,
    [tenantId]
  );
  const { rows: caixasRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM cash_registers WHERE "tenantId" = $1`,
    [tenantId]
  );
  const { rows: movimentacoesRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM stock_movements WHERE "tenantId" = $1 AND "saleId" IS NOT NULL`,
    [tenantId]
  );

  console.log(`Empresa: ${tenant.name} (${tenant.subdomain})\n`);
  console.log("Pedidos por status (todos serão marcados como CANCELLED):");
  console.table(pedidosPorStatus);
  console.log("\nSerá apagado/zerado:");
  console.table({
    "vendas (todas)": vendasRows[0].n,
    "  das quais concluídas (estoque será devolvido)": vendasConcluidasRows[0].n,
    "lançamentos de fiado": fiadoRows[0].n,
    "movimentações de crédito de loja": creditoMovsRows[0].n,
    "clientes com saldo de crédito (será zerado)": clientesComCreditoRows[0].n,
    "caixas (aberturas/fechamentos)": caixasRows[0].n,
    "movimentações de estoque ligadas a vendas": movimentacoesRows[0].n,
  });
  console.log(
    "\nNumeração de venda volta para 0 (próxima venda = #1). Numeração de pedido NÃO é reiniciada: " +
      "pedido é cancelado, não apagado, então o número continua ocupado — reiniciar o contador " +
      "colidiria com pedidos cancelados que ainda existem na tabela."
  );

  if (!confirmado) {
    console.log("\nNada foi alterado. Rode de novo com --confirmar para executar.");
    process.exit(0);
  }

  // Calcula o estoque a devolver ANTES de apagar nada.
  //  - Vendas COMPLETED: cancelamentos normais já devolveram estoque e viraram
  //    CANCELLED, então essas já ficam fora desta soma.
  //  - Pedidos com stockDeductedAt preenchido e ainda não CANCELLED: idem.
  const { rows: linhasVendas } = await client.query<{
    productId: string;
    variantId: string | null;
    qty: number;
  }>(
    `SELECT si."productId", si."variantId", SUM(si.quantity)::int AS qty
     FROM sale_items si
     JOIN sales s ON s.id = si."saleId"
     WHERE s."tenantId" = $1 AND s.status = 'COMPLETED'
     GROUP BY si."productId", si."variantId"`,
    [tenantId]
  );
  const { rows: linhasPedidos } = await client.query<{
    productId: string;
    variantId: string | null;
    qty: number;
  }>(
    `SELECT oi."productId", oi."variantId", SUM(oi.quantity)::int AS qty
     FROM order_items oi
     JOIN orders o ON o.id = oi."orderId"
     WHERE o."tenantId" = $1 AND o."stockDeductedAt" IS NOT NULL AND o.status <> 'CANCELLED'
     GROUP BY oi."productId", oi."variantId"`,
    [tenantId]
  );

  const porProduto = new Map<string, number>();
  const porVariante = new Map<string, number>();
  for (const { productId, variantId, qty } of [...linhasVendas, ...linhasPedidos]) {
    porProduto.set(productId, (porProduto.get(productId) ?? 0) + qty);
    if (variantId) porVariante.set(variantId, (porVariante.get(variantId) ?? 0) + qty);
  }

  console.log(
    `\nDevolvendo estoque de ${porProduto.size} produto(s) / ${porVariante.size} variante(s)...`
  );

  await client.query("BEGIN");
  try {
    for (const [productId, qty] of porProduto) {
      await client.query(`UPDATE products SET "stockQty" = "stockQty" + $1 WHERE id = $2`, [
        qty,
        productId,
      ]);
    }
    for (const [variantId, qty] of porVariante) {
      await client.query(`UPDATE product_variants SET "stockQty" = "stockQty" + $1 WHERE id = $2`, [
        qty,
        variantId,
      ]);
    }

    await client.query(
      `UPDATE orders
       SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = 'Reset administrativo para testes'
       WHERE "tenantId" = $1 AND status <> 'CANCELLED'`,
      [tenantId]
    );

    await client.query(`DELETE FROM fiado_entries WHERE "tenantId" = $1`, [tenantId]);
    await client.query(`DELETE FROM customer_credit_movements WHERE "tenantId" = $1`, [tenantId]);
    await client.query(
      `UPDATE customers SET "creditBalance" = 0, "totalSpent" = 0, "lastPurchaseAt" = NULL WHERE "tenantId" = $1`,
      [tenantId]
    );

    await client.query(
      `DELETE FROM stock_movements WHERE "tenantId" = $1 AND "saleId" IS NOT NULL`,
      [tenantId]
    );
    await client.query(
      `DELETE FROM payments WHERE "saleId" IN (SELECT id FROM sales WHERE "tenantId" = $1)`,
      [tenantId]
    );
    await client.query(
      `DELETE FROM sale_items WHERE "saleId" IN (SELECT id FROM sales WHERE "tenantId" = $1)`,
      [tenantId]
    );
    await client.query(`DELETE FROM sales WHERE "tenantId" = $1`, [tenantId]);

    await client.query(`DELETE FROM cash_movements WHERE "tenantId" = $1`, [tenantId]);
    await client.query(`DELETE FROM cash_registers WHERE "tenantId" = $1`, [tenantId]);

    // Só a venda é zerada (o registro é apagado de verdade acima). O pedido
    // continua na tabela como CANCELLED (histórico do cliente é preservado),
    // então `orderSequence` NUNCA pode voltar a 0 — colidiria com o número
    // de um pedido cancelado que ainda existe (`@@unique([tenantId, number])`
    // em `Order`). Bug real que já aconteceu em produção: mantido aqui como
    // no-op explícito, não removido, pra não passar despercebido de novo se
    // alguém tentar "consertar" trazendo o reset de volta.
    await client.query(`UPDATE tenants SET "saleSequence" = 0 WHERE id = $1`, [tenantId]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  console.log(
    "\nReset concluído: pedidos cancelados, vendas e caixa apagados, fiado/crédito zerados, " +
      "estoque devolvido e numeração reiniciada."
  );
} finally {
  await client.end();
}
