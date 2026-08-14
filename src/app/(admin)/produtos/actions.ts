"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { deleteBlob } from "@/lib/blob";
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
import { recordPriceSnapshotIfChanged } from "@/modules/products/price-history";
import { checkLimit } from "@/lib/plans";
import { canEditCommission, canManageProducts } from "@/lib/permissions";

/**
 * `requireUser()` só confirma autenticação. As ações abaixo (produtos,
 * categorias, marcas, importação CSV) exigem além disso o papel de quem
 * gerencia produtos — antes, só o menu lateral escondia esse acesso; a
 * action em si aceitava a chamada de qualquer usuário autenticado do tenant.
 */
async function requireProductManager(): Promise<
  { error: string } | { user: Awaited<ReturnType<typeof requireUser>> }
> {
  const user = await requireUser();
  if (!canManageProducts(user.role)) {
    return { error: "Você não tem permissão para gerenciar produtos." };
  }
  return { user };
}

// --- Categorias ---

export async function createCategoryAction(input: CategoryInput) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  await prisma.category.create({
    data: {
      tenantId: user.tenantId,
      name: parsed.data.name,
      parentId: parsed.data.parentId || null,
      icon: parsed.data.icon || null,
      counterOnly: parsed.data.counterOnly,
    },
  });

  revalidatePath("/produtos/categorias");
  return { success: "Categoria criada." };
}

export async function updateCategoryAction(id: string, input: CategoryInput) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  if (parsed.data.parentId === id) {
    return { error: "Uma categoria não pode ser pai dela mesma." };
  }

  await prisma.category.updateMany({
    where: { id, tenantId: user.tenantId },
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId || null,
      icon: parsed.data.icon || null,
      counterOnly: parsed.data.counterOnly,
    },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { subdomain: true },
  });

  revalidatePath("/produtos/categorias");
  revalidatePath(`/loja/${tenant.subdomain}`, "layout");
  return { success: "Categoria atualizada." };
}

export async function deleteCategoryAction(id: string) {
  const auth = await requireProductManager();
  if ("error" in auth) return;
  const { user } = auth;
  await prisma.category.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/produtos/categorias");
}

/**
 * Grava a nova ordem de exibição das categorias (a posição de cada id na lista
 * recebida vira o valor salvo em `order`) e reflete essa ordem no catálogo online.
 */
export async function updateCategoryOrderAction(orderedIds: string[]) {
  const auth = await requireProductManager();
  if ("error" in auth) return;
  const { user } = auth;
  if (orderedIds.length === 0) return;

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.updateMany({
        where: { id, tenantId: user.tenantId },
        data: { order: index },
      })
    )
  );

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { subdomain: true },
  });

  revalidatePath("/produtos/categorias");
  revalidatePath(`/loja/${tenant.subdomain}`, "layout");
}

// --- Marcas ---

export async function createBrandAction(input: BrandInput) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
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
  const auth = await requireProductManager();
  if ("error" in auth) return;
  const { user } = auth;
  await prisma.brand.deleteMany({ where: { id, tenantId: user.tenantId } });
  revalidatePath("/produtos/marcas");
}

// --- Produtos ---

function normalizeProductData(data: ProductInput, canSetCommission: boolean) {
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
    // Sem preço promocional, não faz sentido guardar prazo/início/limite de oferta relâmpago.
    promoStartedAt: promoPrice !== null ? (data.promoStartedAt ?? null) : null,
    promoEndsAt: promoPrice !== null ? (data.promoEndsAt ?? null) : null,
    promoStockLimit: promoPrice !== null ? (data.promoStockLimit ?? null) : null,
    catalogPrice: computeCatalogPrice(data.salePrice, promoPrice),
    // Comissão é configuração sensível (quem ganha o quê) — só ADMIN pode
    // mexer (ver `canEditCommission`), mesmo que o resto do formulário esteja
    // liberado pra Gerente e Estoquista também (ver `canManageProducts`).
    commissionEnabled: canSetCommission ? data.commissionEnabled : undefined,
    commissionPercent: canSetCommission ? (data.commissionPercent ?? null) : undefined,
    stockQty: data.stockQty,
    minStock: data.minStock,
    active: data.active,
    showInCatalog: data.showInCatalog,
    isFeatured: data.isFeatured,
    // Sem destaque manual, ordem/período de destaque não fazem sentido.
    featuredOrder: data.isFeatured ? (data.featuredOrder ?? null) : null,
    featuredUntil: data.isFeatured ? (data.featuredUntil ?? null) : null,
  };
}

export async function createProductAction(input: ProductInput) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
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
      ...normalizeProductData(parsed.data, canEditCommission(user.role)),
    },
  });

  await recordPriceSnapshotIfChanged(user.tenantId, product.id, Number(product.catalogPrice));

  if (parsed.data.images.length > 0) {
    await prisma.productImage.createMany({
      data: parsed.data.images.map((url, index) => ({ productId: product.id, url, order: index })),
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
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
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
  const newCatalogPrice = computeCatalogPrice(parsed.data.salePrice, parsed.data.promoPrice ?? null);

  await prisma.product.update({
    where: { id },
    data: normalizeProductData(parsed.data, canEditCommission(user.role)),
  });

  await recordPriceSnapshotIfChanged(
    user.tenantId,
    id,
    newCatalogPrice,
    Number(current.catalogPrice)
  );

  // Fotos não têm identidade própria fora do produto: mais simples recriar a
  // lista (na nova ordem) do que calcular um diff a cada edição.
  const removedUrls = current.images
    .map((image) => image.url)
    .filter((url) => !parsed.data.images.includes(url));

  await prisma.productImage.deleteMany({ where: { productId: id } });
  if (parsed.data.images.length > 0) {
    await prisma.productImage.createMany({
      data: parsed.data.images.map((url, index) => ({ productId: id, url, order: index })),
    });
  }
  for (const url of removedUrls) {
    await deleteBlob(url);
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
  const auth = await requireProductManager();
  if ("error" in auth) return;
  const { user } = auth;

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

/**
 * Cria uma cópia do produto como rascunho (inativo, sem estoque). Não copia
 * `internalCode`/`barcode` (únicos por tenant / geram ambiguidade de leitura
 * no PDV se duplicados) nem fotos — a foto não tem identidade própria fora
 * do produto (ver comentário em `updateProductAction`); copiar a URL faria
 * dois produtos dependerem do mesmo arquivo no blob, e apagar a foto de um
 * quebraria o outro silenciosamente.
 */
export async function duplicateProductAction(id: string) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const current = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { variants: true },
  });
  if (!current) return { error: "Produto não encontrado." };

  const [tenant, productCount] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { plan: true } }),
    prisma.product.count({ where: { tenantId: user.tenantId } }),
  ]);
  const limit = checkLimit(tenant.plan, "products", productCount);
  if (!limit.allowed) return { error: limit.error };

  const duplicate = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      name: `${current.name} (Cópia)`,
      internalCode: null,
      barcode: null,
      categoryId: current.categoryId,
      brandId: current.brandId,
      supplierId: current.supplierId,
      description: current.description,
      costPrice: current.costPrice,
      salePrice: current.salePrice,
      promoPrice: current.promoPrice,
      promoEndsAt: current.promoEndsAt,
      catalogPrice: current.catalogPrice,
      stockQty: 0,
      minStock: current.minStock,
      active: false,
      showInCatalog: current.showInCatalog,
      isFeatured: false,
      variants:
        current.variants.length > 0
          ? {
              create: current.variants.map((variant) => ({
                name: variant.name,
                sku: null,
                barcode: null,
                priceAdjustment: variant.priceAdjustment,
                stockQty: 0,
              })),
            }
          : undefined,
    },
  });

  revalidatePath("/produtos");
  return { success: "Produto duplicado com sucesso.", id: duplicate.id };
}

/** Ativa/desativa um único produto — atalho de linha pro mesmo campo que `updateProductAction` já grava. */
export async function toggleProductActiveAction(id: string, active: boolean) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  await prisma.product.updateMany({ where: { id, tenantId: user.tenantId }, data: { active } });
  revalidatePath("/produtos");
  return { success: active ? "Produto ativado." : "Produto desativado." };
}

/** Ativar/desativar ou trocar categoria/marca de vários produtos de uma vez. */
export async function bulkUpdateProductsAction(
  ids: string[],
  data: { active?: boolean; categoryId?: string | null; brandId?: string | null }
) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  if (ids.length === 0) return { error: "Nenhum produto selecionado." };

  const result = await prisma.product.updateMany({
    where: { id: { in: ids }, tenantId: user.tenantId },
    data,
  });

  revalidatePath("/produtos");
  return { success: `${result.count} produto(s) atualizado(s).` };
}

/**
 * Liga/desliga a comissão de venda em massa — separado de `bulkUpdateProductsAction`
 * porque é uma permissão mais restrita (só ADMIN decide quem ganha comissão,
 * não qualquer um que edita produto — ver `canEditCommission`).
 */
export async function bulkSetCommissionEnabledAction(ids: string[], enabled: boolean) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar comissão." };
  }
  if (ids.length === 0) return { error: "Nenhum produto selecionado." };

  const result = await prisma.product.updateMany({
    where: { id: { in: ids }, tenantId: user.tenantId },
    data: { commissionEnabled: enabled },
  });

  revalidatePath("/produtos");
  return {
    success: `${result.count} produto(s) ${enabled ? "marcado(s) como comissionado(s)" : "sem comissão"}.`,
  };
}

/**
 * Exclui vários produtos de uma vez, pulando os que têm venda registrada
 * (mesma regra de `deleteProductAction`, aplicada em lote).
 */
export async function bulkDeleteProductsAction(ids: string[]) {
  const auth = await requireProductManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  if (ids.length === 0) return { error: "Nenhum produto selecionado." };

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, tenantId: user.tenantId },
    select: { id: true, _count: { select: { saleItems: true } } },
  });
  const deletableIds = products.filter((p) => p._count.saleItems === 0).map((p) => p.id);
  const skippedCount = products.length - deletableIds.length;

  if (deletableIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: deletableIds }, tenantId: user.tenantId } });
  }

  revalidatePath("/produtos");

  const parts = [`${deletableIds.length} produto(s) excluído(s).`];
  if (skippedCount > 0) {
    parts.push(
      `${skippedCount} não pôde(ram) ser excluído(s) por ter(em) vendas registradas — foram apenas mantidos.`
    );
  }
  return { success: parts.join(" ") };
}

// --- Importação CSV ---

export async function importProductsAction(
  _prevState: ImportResult | undefined,
  formData: FormData
): Promise<ImportResult> {
  const auth = await requireProductManager();
  if ("error" in auth) return { created: 0, updated: 0, errors: [auth.error] };
  const { user } = auth;
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { created: 0, updated: 0, errors: ["Selecione um arquivo CSV."] };
  }

  const result = await importProductsFromCsv(user.tenantId, await file.text());

  revalidatePath("/produtos");
  revalidatePath("/estoque");
  return result;
}
