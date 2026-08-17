"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canApplyDiscount, canDiscountFreely, canManageFiado, canSell } from "@/lib/permissions";
import { getOpenCashRegister } from "@/modules/cash/cash-service";
import { createSale } from "@/modules/sales/sale-service";
import { isSellerAssignable } from "@/modules/sales/seller-eligibility";
import {
  resolveConvenioCredential,
  type ConvenioCredential,
} from "@/modules/convenios/convenio-redemption-service";
import {
  resolveProtecaoEficazRedemption,
  type ProtecaoEficazRedemptionCredential,
} from "@/modules/protecao-eficaz/protecao-eficaz-service";
import { createSaleSchema, type CreateSaleInput } from "@/lib/validations/sale";

export type PdvProduct = {
  id: string;
  name: string;
  internalCode: string | null;
  barcode: string | null;
  price: number;
  stockQty: number;
  imageUrl: string | null;
  /** Nome da categoria — usado só pra detectar capinha no carrinho (ver `seller-discount-rules.ts`). */
  categoryName: string | null;
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
): Promise<{ products: PdvProduct[]; exact: boolean; totalCount: number }> {
  const user = await requireUser();
  const term = query.trim();
  if (term.length < 1) return { products: [], exact: false, totalCount: 0 };

  const select = {
    id: true,
    name: true,
    internalCode: true,
    barcode: true,
    salePrice: true,
    promoPrice: true,
    stockQty: true,
    images: { select: { url: true }, orderBy: { order: "asc" as const }, take: 1 },
    category: { select: { name: true } },
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
    category: { name: string } | null;
    variants: { id: string; name: string; priceAdjustment: unknown; stockQty: number }[];
  }): PdvProduct => ({
    id: p.id,
    name: p.name,
    internalCode: p.internalCode,
    barcode: p.barcode,
    price: Number(p.promoPrice ?? p.salePrice),
    stockQty: p.stockQty,
    imageUrl: p.images[0]?.url ?? null,
    categoryName: p.category?.name ?? null,
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
    return { products: [toPdvProduct(exactMatch)], exact: true, totalCount: 1 };
  }

  // Cada palavra digitada precisa aparecer em algum lugar (nome, código
  // interno ou código de barras) — não a frase inteira como um bloco só.
  // Sem isso, buscar só o modelo sem a categoria antes (ex.: "13 pro", sem
  // escrever "capa"/"película" primeiro) ou em ordem diferente da que está
  // cadastrada (ex.: nome "... 13 / 13 PRO / 14 ...", busca "pro 13") não
  // batia com nada, mesmo o produto existindo.
  const words = term.split(/\s+/).filter(Boolean);
  const where = {
    tenantId: user.tenantId,
    active: true,
    AND: words.map((word) => ({
      OR: [
        { name: { contains: word, mode: "insensitive" as const } },
        { internalCode: { contains: word, mode: "insensitive" as const } },
        { barcode: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };

  // `take` limita quantos aparecem na sugestão, mas com um termo genérico
  // (ex.: "película 3d", que já bateu em 249 produtos — um por modelo de
  // celular) só os 15 primeiros em ordem alfabética apareciam, sem nenhum
  // aviso de que havia mais — parecia que o produto procurado não existia.
  // `totalCount` deixa a tela avisar "mostrando X de Y" pra o vendedor saber
  // que precisa digitar mais (ex.: a marca/modelo) pra achar o certo.

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      select,
      orderBy: { name: "asc" },
      take: 30,
    }),
    prisma.product.count({ where }),
  ]);

  return { products: products.map(toPdvProduct), exact: false, totalCount };
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

/**
 * Checagem prévia do QR do convênio — só pra mostrar o "confirme que é essa
 * pessoa" pro vendedor antes de aplicar. Não é a validação que vale de
 * verdade: `createSale` refaz tudo de novo no momento de fechar a venda.
 */
export async function validateConvenioCredentialAction(
  rawInput: string
): Promise<{ error: string } | ({ ok: true } & ConvenioCredential)> {
  const user = await requireUser();
  if (!canSell(user.role)) return { error: "Seu perfil não tem permissão para vender." };

  const result = await resolveConvenioCredential(user.tenantId, rawInput);
  if (!result.ok) return { error: result.error };
  return result;
}

/**
 * Checagem prévia da troca de Proteção Eficaz — mesmo princípio da checagem
 * do convênio: só mostra o nome do cliente pro vendedor confirmar. `createSale`
 * revalida tudo de novo (status, prazo, se já foi trocada) no momento de fechar.
 */
export async function validateProtecaoEficazRedemptionAction(
  saleNumber: number
): Promise<{ error: string } | ({ ok: true } & ProtecaoEficazRedemptionCredential)> {
  const user = await requireUser();
  if (!canSell(user.role)) return { error: "Seu perfil não tem permissão para vender." };

  const result = await resolveProtecaoEficazRedemption(user.tenantId, saleNumber);
  if (!result.ok) return { error: result.error };
  return result;
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
      allowFreeDiscount: canDiscountFreely(user.role),
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
