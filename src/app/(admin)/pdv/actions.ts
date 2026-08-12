"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canApplyDiscount, canManageFiado, canSell } from "@/lib/permissions";
import { getOpenCashRegister } from "@/modules/cash/cash-service";
import { createSale } from "@/modules/sales/sale-service";
import { isSellerAssignable } from "@/modules/sales/seller-eligibility";
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

export type PdvSellerOption = { id: string; name: string; role: string };

/**
 * Vendedores ativos do tenant, para a seleção obrigatória antes do pagamento
 * (ver `SellerPickerModal`). Não inclui o próprio usuário automaticamente —
 * quem opera o caixa não é necessariamente quem vende.
 */
export async function listActiveSellersAction(): Promise<PdvSellerOption[]> {
  const user = await requireUser();
  const sellers = await prisma.user.findMany({
    where: { tenantId: user.tenantId, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return sellers.filter((seller) => canSell(seller.role));
}

export async function createSaleAction(
  input: CreateSaleInput
): Promise<{ error: string } | { saleId: string; number: number; changeAmount: number }> {
  const user = await requireUser();
  if (!canSell(user.role)) {
    return { error: "Seu perfil não tem permissão para realizar vendas." };
  }

  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados da venda inválidos." };
  }

  // O vendedor nunca é assumido como o usuário logado: é relido do banco e
  // revalidado aqui, fechando o caminho de burlar a seleção chamando esta
  // Server Action diretamente sem passar pela tela de seleção do PDV.
  const seller = await prisma.user.findFirst({
    where: { id: parsed.data.sellerId },
    select: { tenantId: true, active: true, role: true },
  });
  if (!isSellerAssignable(seller, user.tenantId)) {
    return { error: "Selecione um vendedor válido para concluir a venda." };
  }

  const register = await getOpenCashRegister(user.tenantId);
  if (!register) {
    return { error: "Nenhum caixa aberto. Abra o caixa antes de vender." };
  }

  const result = await createSale(
    {
      tenantId: user.tenantId,
      sellerId: parsed.data.sellerId,
      cashRegisterId: register.id,
      allowDiscount: canApplyDiscount(user.role),
      allowFiado: canManageFiado(user.role),
      operatorId: user.id,
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
