import { prisma } from "@/lib/prisma";
import { computeCatalogPrice } from "./catalog-price";
import { recordPriceSnapshotIfChanged } from "./price-history";

export type SetInitialPriceResult =
  | { ok: true; name: string; price: number }
  | { ok: false; error: string };

/**
 * Grava o primeiro preço de venda de um produto que foi cadastrado sem preço
 * (R$ 0,00, ex.: importação da nota do fornecedor) — chamado pelo PDV na
 * primeira vez que o produto passa no caixa. Só vale uma vez: se o produto já
 * tem preço (ou promoção), recusa; mudar depois é pela tela do produto. O
 * `updateMany` com `salePrice: 0` no filtro garante isso mesmo com dois
 * caixas definindo o preço ao mesmo tempo — só o primeiro grava.
 */
export async function setInitialProductPrice(
  tenantId: string,
  productId: string,
  price: number
): Promise<SetInitialPriceResult> {
  const newPrice = Math.round(price * 100) / 100;
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, error: "Informe um preço maior que zero." };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true, name: true, salePrice: true, promoPrice: true, catalogPrice: true },
  });
  if (!product) return { ok: false, error: "Produto não encontrado." };
  if (Number(product.salePrice) > 0 || product.promoPrice !== null) {
    return {
      ok: false,
      error: "Este produto já tem preço. Para mudar, use a tela do produto.",
    };
  }

  const catalogPrice = computeCatalogPrice(newPrice, null);
  const { count } = await prisma.product.updateMany({
    where: { id: productId, tenantId, salePrice: 0, promoPrice: null },
    data: { salePrice: newPrice, catalogPrice },
  });
  if (count === 0) {
    return {
      ok: false,
      error: "O preço deste produto acabou de ser definido em outro caixa. Busque o produto de novo.",
    };
  }

  await recordPriceSnapshotIfChanged(tenantId, productId, catalogPrice, Number(product.catalogPrice));
  return { ok: true, name: product.name, price: newPrice };
}
