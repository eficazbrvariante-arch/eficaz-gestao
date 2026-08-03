"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canApplyDiscount, canSell } from "@/lib/permissions";
import { getOpenCashRegister } from "@/modules/cash/cash-service";
import { createSale } from "@/modules/sales/sale-service";
import { createSaleSchema, type CreateSaleInput } from "@/lib/validations/sale";

export type PdvProduct = {
  id: string;
  name: string;
  internalCode: string | null;
  barcode: string | null;
  price: number;
  stockQty: number;
  imageUrl: string | null;
  variants: { id: string; name: string; priceAdjustment: number; stockQty: number }[];
};

/**
 * Busca produtos para o PDV.
 *
 * `exact` indica que o termo casou exatamente com um código de barras ou código
 * interno — o PDV usa isso para adicionar direto ao carrinho quando vem do scanner.
 */
export async function searchProductsAction(
  query: string
): Promise<{ products: PdvProduct[]; exact: boolean }> {
  const user = await requireUser();
  const term = query.trim();
  if (term.length < 1) return { products: [], exact: false };

  const select = {
    id: true,
    name: true,
    internalCode: true,
    barcode: true,
    salePrice: true,
    promoPrice: true,
    stockQty: true,
    images: { select: { url: true }, orderBy: { order: "asc" as const }, take: 1 },
    variants: {
      select: { id: true, name: true, priceAdjustment: true, stockQty: true },
    },
  };

  const toPdvProduct = (p: {
    id: string;
    name: string;
    internalCode: string | null;
    barcode: string | null;
    salePrice: unknown;
    promoPrice: unknown;
    stockQty: number;
    images: { url: string }[];
    variants: { id: string; name: string; priceAdjustment: unknown; stockQty: number }[];
  }): PdvProduct => ({
    id: p.id,
    name: p.name,
    internalCode: p.internalCode,
    barcode: p.barcode,
    price: Number(p.promoPrice ?? p.salePrice),
    stockQty: p.stockQty,
    imageUrl: p.images[0]?.url ?? null,
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      priceAdjustment: Number(v.priceAdjustment),
      stockQty: v.stockQty,
    })),
  });

  // Primeiro tenta casar código de barras / código interno exatamente (fluxo do scanner).
  const exactMatch = await prisma.product.findFirst({
    where: {
      tenantId: user.tenantId,
      active: true,
      OR: [{ barcode: term }, { internalCode: term }],
    },
    select,
  });

  if (exactMatch) {
    return { products: [toPdvProduct(exactMatch)], exact: true };
  }

  const products = await prisma.product.findMany({
    where: {
      tenantId: user.tenantId,
      active: true,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { internalCode: { contains: term, mode: "insensitive" } },
        { barcode: { contains: term, mode: "insensitive" } },
      ],
    },
    select,
    orderBy: { name: "asc" },
    take: 15,
  });

  return { products: products.map(toPdvProduct), exact: false };
}

export async function createSaleAction(input: CreateSaleInput) {
  const user = await requireUser();
  if (!canSell(user.role)) {
    return { error: "Seu perfil não tem permissão para realizar vendas." };
  }

  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados da venda inválidos." };
  }

  const register = await getOpenCashRegister(user.tenantId);
  if (!register) {
    return { error: "Nenhum caixa aberto. Abra o caixa antes de vender." };
  }

  const result = await createSale(
    {
      tenantId: user.tenantId,
      sellerId: user.id,
      cashRegisterId: register.id,
      allowDiscount: canApplyDiscount(user.role),
    },
    parsed.data
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/pdv");
  revalidatePath("/vendas");
  revalidatePath("/caixa");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/dashboard");

  return { saleId: result.saleId, number: result.number, changeAmount: result.changeAmount };
}
