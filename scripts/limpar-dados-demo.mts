/**
 * Remove os dados de demonstração criados por `seed:demo`, deixando a empresa
 * pronta para uso real: sem produtos, clientes, vendas, pedidos nem histórico.
 *
 * A empresa (Tenant) e as suas configurações são PRESERVADAS — só o movimento
 * é apagado. Os usuários de teste também são removidos, mas apenas se já existir
 * outro administrador ativo: ninguém pode ficar trancado para fora do sistema.
 *
 * Uso:
 *   npx tsx scripts/limpar-dados-demo.mts              → só mostra o que seria apagado
 *   npx tsx scripts/limpar-dados-demo.mts --confirmar  → apaga de verdade
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/** E-mails criados pelo seed. Nenhum outro usuário é tocado. */
const USUARIOS_DE_TESTE = ["admin@eficazbr.test", "ana@eficazbr.test"];

const confirmado = process.argv.includes("--confirmar");

const tenant = await prisma.tenant.findFirst();
if (!tenant) {
  console.error("Nenhuma empresa encontrada no banco. Nada a fazer.");
  process.exit(1);
}

const where = { tenantId: tenant.id };

const [
  produtos,
  categorias,
  marcas,
  fornecedores,
  clientes,
  vendas,
  pedidos,
  caixas,
  movimentacoes,
  zonas,
  auditoria,
  usuariosTeste,
  outrosAdmins,
] = await Promise.all([
  prisma.product.count({ where }),
  prisma.category.count({ where }),
  prisma.brand.count({ where }),
  prisma.supplier.count({ where }),
  prisma.customer.count({ where }),
  prisma.sale.count({ where }),
  prisma.order.count({ where }),
  prisma.cashRegister.count({ where }),
  prisma.stockMovement.count({ where }),
  prisma.deliveryZone.count({ where }),
  prisma.auditLog.count({ where }),
  prisma.user.count({ where: { ...where, email: { in: USUARIOS_DE_TESTE } } }),
  prisma.user.count({
    where: { ...where, role: "ADMIN", active: true, email: { notIn: USUARIOS_DE_TESTE } },
  }),
]);

console.log(`Empresa: ${tenant.name} (${tenant.subdomain})\n`);
console.log("Será apagado:");
console.table({
  produtos,
  categorias,
  marcas,
  fornecedores,
  clientes,
  vendas,
  pedidos,
  "caixas (aberturas/fechamentos)": caixas,
  "movimentações de estoque": movimentacoes,
  "zonas de entrega": zonas,
  "registros de auditoria": auditoria,
  "usuários de teste": usuariosTeste,
});
console.log(`Outros administradores ativos: ${outrosAdmins}`);

if (!confirmado) {
  console.log("\nNada foi apagado. Rode de novo com --confirmar para executar.");
  await prisma.$disconnect();
  process.exit(0);
}

// Trava de segurança: sem outro admin, apagar os usuários de teste deixaria a
// empresa sem ninguém capaz de entrar no sistema.
if (usuariosTeste > 0 && outrosAdmins === 0) {
  console.error(
    "\nABORTADO: não existe nenhum administrador além dos usuários de teste.\n" +
      "Crie o seu usuário em /usuarios (papel Administrador) antes de rodar a limpeza.",
  );
  await prisma.$disconnect();
  process.exit(1);
}

// Ordem importa: os filhos saem antes dos pais. Onde há onDelete: Cascade o
// banco daria conta sozinho, mas ser explícito deixa o efeito visível aqui.
await prisma.$transaction([
  prisma.payment.deleteMany({ where: { sale: where } }),
  prisma.saleItem.deleteMany({ where: { sale: where } }),
  prisma.sale.deleteMany({ where }),

  prisma.orderItem.deleteMany({ where: { order: where } }),
  prisma.order.deleteMany({ where }),

  prisma.stockMovement.deleteMany({ where }),
  prisma.cashMovement.deleteMany({ where }),
  prisma.cashRegister.deleteMany({ where }),

  prisma.productImage.deleteMany({ where: { product: where } }),
  prisma.productVariant.deleteMany({ where: { product: where } }),
  prisma.product.deleteMany({ where }),

  prisma.customer.deleteMany({ where }),
  prisma.category.deleteMany({ where }),
  prisma.brand.deleteMany({ where }),
  prisma.supplier.deleteMany({ where }),
  prisma.deliveryZone.deleteMany({ where }),
  prisma.auditLog.deleteMany({ where }),

  prisma.user.deleteMany({ where: { ...where, email: { in: USUARIOS_DE_TESTE } } }),

  // A numeração volta a zero: a primeira venda real será a nº 1.
  prisma.tenant.update({
    where: { id: tenant.id },
    data: { saleSequence: 0, orderSequence: 0 },
  }),
]);

console.log("\nLimpeza concluída. A empresa e as configurações foram preservadas.");
await prisma.$disconnect();
