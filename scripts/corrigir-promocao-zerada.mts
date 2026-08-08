/**
 * Lista produtos cujo preço promocional foi salvo como 0 em vez de vazio (bug do
 * formulário de produto: limpar o campo "Preço promocional" gravava 0 ao invés de
 * null, fazendo a venda usar R$ 0,00 como preço — ver correção em
 * src/lib/validations/catalog.ts).
 *
 * Isso deixa o produto parecendo "grátis" no PDV e no catálogo (promoPrice
 * substitui salePrice sempre que não é null).
 *
 * Uso:
 *   npx tsx scripts/corrigir-promocao-zerada.mts              → só lista os afetados
 *   npx tsx scripts/corrigir-promocao-zerada.mts --confirmar  → zera promoPrice (NULL) e recalcula catalogPrice
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { prisma } from "../src/lib/prisma";

const confirmado = process.argv.includes("--confirmar");

const afetados = await prisma.product.findMany({
  where: { promoPrice: 0 },
  select: {
    id: true,
    tenantId: true,
    internalCode: true,
    barcode: true,
    name: true,
    salePrice: true,
  },
  orderBy: { name: "asc" },
});

if (afetados.length === 0) {
  console.log("Nenhum produto com preço promocional zerado encontrado.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`${afetados.length} produto(s) com preço promocional = 0 (venderiam por R$ 0,00):\n`);
console.table(
  afetados.map((p) => ({
    codigo: p.internalCode ?? p.barcode ?? "-",
    nome: p.name,
    "preço de venda": Number(p.salePrice).toFixed(2),
  })),
);

if (!confirmado) {
  console.log("\nNada foi alterado. Rode de novo com --confirmar para corrigir (promoPrice -> NULL).");
  await prisma.$disconnect();
  process.exit(0);
}

for (const p of afetados) {
  await prisma.product.update({
    where: { id: p.id },
    data: { promoPrice: null, catalogPrice: p.salePrice },
  });
}

console.log(`\n${afetados.length} produto(s) corrigido(s): preço promocional removido, preço de venda restaurado.`);
await prisma.$disconnect();
