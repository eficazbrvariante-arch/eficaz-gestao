"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  categorySchema,
  brandSchema,
  productSchema,
  type CategoryInput,
  type BrandInput,
  type ProductInput,
} from "@/lib/validations/catalog";
import {
  importProductsFromCsv,
  type ImportResult,
} from "@/modules/products/import-service";
import { computeCatalogPrice } from "@/modules/products/catalog-price";
import { checkLimit } from "@/lib/plans";

// --- Categorias ---

export async function createCategoryAction(input: CategoryInput) {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  await prisma.category.create({
    data: {
      tenantId: user.tenantId,
      name: parsed.data.name,
      parentId: parsed.data.parentId || null,
    },
  });

  revalidatePath("/produtos/categorias");
  return { success: "Categoria criada." };
}

export async function deleteCategoryAction(id: string) {
  const user = await requireUser();
  await prisma.category.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/produtos/categorias");
}

// --- Marcas ---

export async function createBrandAction(input: BrandInput) {
  const user = await requireUser();
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const existing = await prisma.brand.findFirst({
    where: { tenantId: user.tenantId, name: parsed.data.name },
  });
  if (existing) return { error: "Já existe uma marca com este nome." };

  await prisma.brand.create({
    data: { tenantId: user.tenantId, name: parsed.data.name },
  });

  revalidatePath("/produtos/marcas");
  return { success: "Marca criada." };
}

export async function deleteBrandAction(id: string) {
  const user = await requireUser();
  await prisma.brand.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/produtos/marcas");
}

// --- Produtos ---

function normalizeProductData(data: ProductInput) {
  const promoPrice = data.promoPrice ?? null;
  return {
    name: data.name,
    internalCode: data.internalCode || null,
    barcode: data.barcode || null,
    categoryId: data.categoryId || null,
    brandId: data.brandId || null,
    supplierId: data.supplierId || null,
    description: data.description || null,
    costPrice: data.costPrice,
    salePrice: data.salePrice,
    promoPrice,
    catalogPrice: computeCatalogPrice(data.salePrice, promoPrice),
    stockQty: data.stockQty,
    minStock: data.minStock,
    active: data.active,
    showInCatalog: data.showInCatalog,
  };
}

export async function createProductAction(input: ProductInput) {
  const user = await requireUser();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const [tenant, productCount] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { plan: true },
    }),
    prisma.product.count({ where: { tenantId: user.tenantId } }),
  ]);
  const limit = checkLimit(tenant.plan, "products", productCount);
  if (!limit.allowed) return { error: limit.error };

  if (parsed.data.internalCode) {
    const existing = await prisma.product.findFirst({
      where: { tenantId: user.tenantId, internalCode: parsed.data.internalCode },
    });
    if (existing) return { error: "Já existe um produto com este código interno." };
  }

  const product = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      ...normalizeProductData(parsed.data),
    },
  });

  if (parsed.data.imageUrl) {
    await prisma.productImage.create({
      data: { productId: product.id, url: parsed.data.imageUrl, order: 0 },
    });
  }

  if (parsed.data.variants.length > 0) {
    await prisma.productVariant.createMany({
      data: parsed.data.variants.map((variant) => ({
        productId: product.id,
        name: variant.name,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        priceAdjustment: variant.priceAdjustment,
        stockQty: variant.stockQty,
      })),
    });
  }

  if (parsed.data.stockQty > 0) {
    await prisma.stockMovement.create({
      data: {
        tenantId: user.tenantId,
        productId: product.id,
        type: "IN",
        quantity: parsed.data.stockQty,
        reason: "Estoque inicial do cadastro",
        userId: user.id,
      },
    });
  }

  revalidatePath("/produtos");
  redirect("/produtos");
}

export async function updateProductAction(id: string, input: ProductInput) {
  const user = await requireUser();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const current = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { images: true },
  });
  if (!current) return { error: "Produto não encontrado." };

  if (parsed.data.internalCode) {
    const existing = await prisma.product.findFirst({
      where: {
        tenantId: user.tenantId,
        internalCode: parsed.data.internalCode,
        NOT: { id },
      },
    });
    if (existing) return { error: "Já existe um produto com este código interno." };
  }

  const stockDelta = parsed.data.stockQty - current.stockQty;

  await prisma.product.update({
    where: { id },
    data: normalizeProductData(parsed.data),
  });

  if (parsed.data.imageUrl) {
    const firstImage = current.images[0];
    if (firstImage) {
      await prisma.productImage.update({
        where: { id: firstImage.id },
        data: { url: parsed.data.imageUrl },
      });
    } else {
      await prisma.productImage.create({
        data: { productId: id, url: parsed.data.imageUrl, order: 0 },
      });
    }
  }

  if (stockDelta !== 0) {
    await prisma.stockMovement.create({
      data: {
        tenantId: user.tenantId,
        productId: id,
        type: "ADJUST",
        quantity: stockDelta,
        reason: "Ajuste manual via edição do produto",
        userId: user.id,
      },
    });
  }

  await prisma.productVariant.deleteMany({ where: { productId: id } });
  if (parsed.data.variants.length > 0) {
    await prisma.productVariant.createMany({
      data: parsed.data.variants.map((variant) => ({
        productId: id,
        name: variant.name,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        priceAdjustment: variant.priceAdjustment,
        stockQty: variant.stockQty,
      })),
    });
  }

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${id}`);
  redirect("/produtos");
}

export async function deleteProductAction(id: string) {
  const user = await requireUser();

  // O histórico de vendas precisa continuar íntegro: um produto já vendido é
  // desativado, nunca excluído. A lista de produtos desabilita o botão nesse caso;
  // esta checagem é a defesa no servidor, para não depender do cliente.
  const soldCount = await prisma.saleItem.count({
    where: { productId: id, sale: { tenantId: user.tenantId } },
  });
  if (soldCount > 0) {
    revalidatePath("/produtos");
    return;
  }

  await prisma.product.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/produtos");
}

// --- Importação CSV ---

export async function importProductsAction(
  _prevState: ImportResult | undefined,
  formData: FormData
): Promise<ImportResult> {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { created: 0, updated: 0, errors: ["Selecione um arquivo CSV."] };
  }

  const result = await importProductsFromCsv(user.tenantId, await file.text());

  revalidatePath("/produtos");
  revalidatePath("/estoque");
  return result;
}
