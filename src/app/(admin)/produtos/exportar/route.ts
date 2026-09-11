import { stringify } from "csv-stringify/sync";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CSV_COLUMNS } from "@/lib/csv-columns";
import { canManageProducts, canViewProductCost } from "@/lib/permissions";

export async function GET() {
  const user = await requireUser();
  // Antes qualquer perfil logado baixava a planilha inteira, com custo.
  if (!canManageProducts(user.role)) {
    return new Response("Sem permissão.", { status: 403 });
  }
  // Coluna mantida (o arquivo continua reimportável), só vazia pra quem não vê custo.
  const showCost = canViewProductCost(user.role);

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId },
    include: { category: true, brand: true, supplier: true },
    orderBy: { name: "asc" },
  });

  const rows = products.map((product) => ({
    nome: product.name,
    codigo_interno: product.internalCode ?? "",
    codigo_barras: product.barcode ?? "",
    categoria: product.category?.name ?? "",
    marca: product.brand?.name ?? "",
    fornecedor: product.supplier?.name ?? "",
    descricao: product.description ?? "",
    preco_custo: showCost ? product.costPrice.toString() : "",
    preco_venda: product.salePrice.toString(),
    preco_promocional: product.promoPrice?.toString() ?? "",
    estoque: product.stockQty.toString(),
    estoque_minimo: product.minStock.toString(),
    ativo: product.active ? "sim" : "nao",
    mostrar_catalogo: product.showInCatalog ? "sim" : "nao",
  }));

  const csv = stringify(rows, { header: true, columns: CSV_COLUMNS as unknown as string[] });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="produtos.csv"`,
    },
  });
}
