import { stringify } from "csv-stringify/sync";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CSV_COLUMNS } from "@/lib/csv-columns";

export async function GET() {
  const user = await requireUser();

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
    preco_custo: product.costPrice.toString(),
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
