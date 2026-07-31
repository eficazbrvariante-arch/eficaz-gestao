import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";
import { computeCatalogPrice } from "./catalog-price";

export type ImportResult = {
  created: number;
  updated: number;
  errors: string[];
};

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "sim", "yes"].includes(value.trim().toLowerCase());
}

/**
 * Importa produtos a partir do conteúdo de um CSV.
 *
 * Categorias, marcas e fornecedores informados que ainda não existirem no tenant
 * são criados automaticamente. Produtos cujo `codigo_interno` já exista no tenant
 * são atualizados; os demais são criados.
 */
export async function importProductsFromCsv(
  tenantId: string,
  csvText: string
): Promise<ImportResult> {
  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    return { created: 0, updated: 0, errors: ["Não foi possível ler o arquivo CSV enviado."] };
  }

  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const categoryCache = new Map<string, string>();
  const brandCache = new Map<string, string>();
  const supplierCache = new Map<string, string>();

  async function resolveCategory(name: string | undefined) {
    if (!name?.trim()) return null;
    const key = name.trim();
    const cached = categoryCache.get(key);
    if (cached) return cached;
    let category = await prisma.category.findFirst({ where: { tenantId, name: key } });
    if (!category) category = await prisma.category.create({ data: { tenantId, name: key } });
    categoryCache.set(key, category.id);
    return category.id;
  }

  async function resolveBrand(name: string | undefined) {
    if (!name?.trim()) return null;
    const key = name.trim();
    const cached = brandCache.get(key);
    if (cached) return cached;
    let brand = await prisma.brand.findFirst({ where: { tenantId, name: key } });
    if (!brand) brand = await prisma.brand.create({ data: { tenantId, name: key } });
    brandCache.set(key, brand.id);
    return brand.id;
  }

  async function resolveSupplier(name: string | undefined) {
    if (!name?.trim()) return null;
    const key = name.trim();
    const cached = supplierCache.get(key);
    if (cached) return cached;
    let supplier = await prisma.supplier.findFirst({ where: { tenantId, name: key } });
    if (!supplier) supplier = await prisma.supplier.create({ data: { tenantId, name: key } });
    supplierCache.set(key, supplier.id);
    return supplier.id;
  }

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2; // +1 do cabeçalho, +1 para começar em 1
    const name = row.nome?.trim();
    if (!name) {
      result.errors.push(`Linha ${lineNumber}: nome do produto é obrigatório.`);
      continue;
    }

    const salePrice = parseNumber(row.preco_venda);
    const promoPrice = row.preco_promocional?.trim()
      ? parseNumber(row.preco_promocional)
      : null;

    const data = {
      name,
      internalCode: row.codigo_interno?.trim() || null,
      barcode: row.codigo_barras?.trim() || null,
      categoryId: await resolveCategory(row.categoria),
      brandId: await resolveBrand(row.marca),
      supplierId: await resolveSupplier(row.fornecedor),
      description: row.descricao?.trim() || null,
      costPrice: parseNumber(row.preco_custo),
      salePrice,
      promoPrice,
      catalogPrice: computeCatalogPrice(salePrice, promoPrice),
      stockQty: Math.round(parseNumber(row.estoque)),
      minStock: Math.round(parseNumber(row.estoque_minimo)),
      active: parseBoolean(row.ativo, true),
      showInCatalog: parseBoolean(row.mostrar_catalogo, true),
    };

    try {
      const internalCode = data.internalCode;
      const existing = internalCode
        ? await prisma.product.findFirst({ where: { tenantId, internalCode } })
        : null;

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        result.updated += 1;
      } else {
        await prisma.product.create({ data: { tenantId, ...data } });
        result.created += 1;
      }
    } catch {
      result.errors.push(`Linha ${lineNumber}: erro ao salvar o produto "${name}".`);
    }
  }

  return result;
}
