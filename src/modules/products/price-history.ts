import { prisma } from "@/lib/prisma";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Registra um novo ponto no histórico de preço — mas só quando o preço
 * efetivo (`computeCatalogPrice`) realmente mudou. Sem isso, toda edição do
 * produto (mesmo as que não mexem em preço) geraria ruído no histórico usado
 * para calcular o preço riscado.
 *
 * Passe `previousEffectivePrice` como `undefined` num cadastro novo — a
 * primeira linha do histórico é sempre gravada.
 */
export async function recordPriceSnapshotIfChanged(
  tenantId: string,
  productId: string,
  newEffectivePrice: number,
  previousEffectivePrice?: number
) {
  if (previousEffectivePrice !== undefined && previousEffectivePrice === newEffectivePrice) return;

  await prisma.productPriceHistory.create({
    data: { tenantId, productId, effectivePrice: newEffectivePrice },
  });
}

/**
 * Menor preço efetivo praticado nos últimos 30 dias, por produto.
 *
 * Consulta em lote (um único `groupBy`) para não gerar N+1 ao montar grades
 * e prateleiras do catálogo. Produtos sem nenhuma linha de histórico no
 * período (ex.: preço nunca mudou desde que este recurso existe) não entram
 * no mapa de retorno — a Lei do Preço Riscado exige um preço anterior real
 * para riscar; sem histórico, nenhum preço "de" é exibido.
 */
export async function getLowestPriceLast30Days(
  tenantId: string,
  productIds: string[]
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const rows = await prisma.productPriceHistory.groupBy({
    by: ["productId"],
    where: { tenantId, productId: { in: productIds }, recordedAt: { gte: since } },
    _min: { effectivePrice: true },
  });

  const result = new Map<string, number>();
  for (const row of rows) {
    if (row._min.effectivePrice !== null) {
      result.set(row.productId, Number(row._min.effectivePrice));
    }
  }
  return result;
}
