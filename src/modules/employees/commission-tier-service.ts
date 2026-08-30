import { prisma } from "@/lib/prisma";
import { currentMonthStartISO, monthRange, nextMonthStartISO } from "@/lib/format";
import {
  computeProgressiveCommission,
  computeTierProgress,
  type CommissionTierInput,
  type ProgressiveCommissionResult,
  type TierProgress,
} from "@/lib/commission-tiers";
import { COMMISSION_POLICY_EFFECTIVE_AT } from "./commission-policy";

export { computeProgressiveCommission, computeTierProgress } from "@/lib/commission-tiers";
export type {
  CommissionTierInput,
  CommissionTierBreakdownRow,
  ProgressiveCommissionResult,
  TierProgress,
} from "@/lib/commission-tiers";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

type CommissionableItem = {
  total: unknown;
  quantity: number;
  product: {
    commissionType: "PERCENT" | "FIXED";
    commissionPercent: unknown;
    commissionFixedAmount: unknown;
  };
};

/**
 * Comissão de um item por exceção própria de produto
 * (`Product.commissionFixedAmount`/`commissionPercent`) — `null` quando o
 * produto não tem exceção (comissiona pela faixa progressiva do vendedor).
 */
function productOverrideCommission(item: CommissionableItem): number | null {
  const { product, total, quantity } = item;
  if (product.commissionType === "FIXED" && product.commissionFixedAmount != null) {
    return Number(product.commissionFixedAmount) * quantity;
  }
  if (product.commissionPercent != null) {
    return (Number(total) * Number(product.commissionPercent)) / 100;
  }
  return null;
}

/**
 * Separa o faturamento de um vendedor entre "elegível às faixas" e "exceção
 * por produto" (que soma comissão à parte, fora do cálculo progressivo) —
 * função central única usada tanto pro cálculo mensal de um vendedor quanto
 * pro lote do ranking, pra não duplicar essa regra em dois lugares.
 */
function splitOverrideAndTierEligible(items: CommissionableItem[]) {
  let tierEligibleSales = 0;
  let overrideSales = 0;
  let overrideCommission = 0;

  for (const item of items) {
    const override = productOverrideCommission(item);
    if (override !== null) {
      overrideSales += Number(item.total);
      overrideCommission += override;
    } else {
      tierEligibleSales += Number(item.total);
    }
  }

  return { tierEligibleSales, overrideSales, overrideCommission };
}

/**
 * Faixas vigentes pro mês pedido: o `CommissionTierSet` mais recente com
 * `validFrom` no início desse mês ou antes — nunca um conjunto criado depois
 * (evita qualquer alteração futura mudar retroativamente um mês já
 * calculado/fechado). Sem nenhum conjunto configurado ainda (tenant que nunca
 * abriu "Configurações de Comissão"), cai no comportamento de hoje: uma única
 * faixa de R$0 sem teto na alíquota geral do tenant — mesmo resultado de
 * antes das faixas existirem, sem precisar de nenhuma migração de dados.
 */
export async function getTierSetForMonth(
  tenantId: string,
  monthStartISO: string
): Promise<{ tierSetId: string | null; tiers: CommissionTierInput[] }> {
  const { start: monthStart } = monthRange(monthStartISO);

  const tierSet = await prisma.commissionTierSet.findFirst({
    where: { tenantId, validFrom: { lte: monthStart } },
    orderBy: { validFrom: "desc" },
    include: { tiers: { where: { active: true }, orderBy: { order: "asc" } } },
  });

  if (tierSet && tierSet.tiers.length > 0) {
    return {
      tierSetId: tierSet.id,
      tiers: tierSet.tiers.map((t) => ({
        name: t.name,
        order: t.order,
        minAmount: Number(t.minAmount),
        maxAmount: t.maxAmount === null ? null : Number(t.maxAmount),
        percent: Number(t.percent),
      })),
    };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { defaultCommissionPercent: true },
  });
  return {
    tierSetId: null,
    tiers: [
      { name: "Padrão", order: 0, minAmount: 0, maxAmount: null, percent: Number(tenant.defaultCommissionPercent) },
    ],
  };
}

export type MonthlySaleCommission = { createdAt: Date; commission: number };

/**
 * Comissão de cada venda de vários vendedores num mês só, calculada
 * marginal/progressivamente: percorre os itens em ordem cronológica por
 * vendedor, mantém o faturamento elegível acumulado, e cada item comissiona
 * só a fatia do acumulado que ele empurra pra frente — mesma regra de
 * `computeProgressiveCommission` (a comissão de uma venda é
 * `progressivo(acumulado depois) − progressivo(acumulado antes)`), só que
 * atribuída venda a venda em vez de fechada no total do mês. Item com
 * exceção própria de produto soma direto, fora da faixa, igual a
 * `computeSellerMonthlyCommission`.
 *
 * Base de `getCommissionTotalsByUsers`/`getSellerCommissionHistory`
 * (`commission-service.ts`) — pra elas nunca duplicarem a regra da faixa, e
 * pra Ranking/histórico/total acumulado sempre baterem entre si.
 */
export async function getMonthlySaleCommissionsByUsers(
  tenantId: string,
  userIds: string[],
  monthStartISO: string
): Promise<Map<string, Map<string, MonthlySaleCommission>>> {
  const result = new Map<string, Map<string, MonthlySaleCommission>>();
  if (userIds.length === 0) return result;

  const { start, end } = monthRange(monthStartISO);
  const effectiveStart = start < COMMISSION_POLICY_EFFECTIVE_AT ? COMMISSION_POLICY_EFFECTIVE_AT : start;
  if (effectiveStart >= end) return result;

  const [itemsRaw, tierData] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        sale: {
          tenantId,
          sellerId: { in: userIds },
          status: "COMPLETED",
          createdAt: { gte: effectiveStart, lt: end },
        },
      },
      select: {
        saleId: true,
        total: true,
        quantity: true,
        product: { select: { commissionType: true, commissionPercent: true, commissionFixedAmount: true } },
        sale: { select: { sellerId: true, createdAt: true, payments: { select: { method: true } } } },
      },
      orderBy: { sale: { createdAt: "asc" } },
    }),
    getTierSetForMonth(tenantId, monthStartISO),
  ]);
  // Venda paga (mesmo que só em parte) com Crédito Eficaz nunca gera
  // comissão — pedido explícito do usuário: o crédito é liberado
  // principalmente pra Assistência Técnica (que também não comissiona), e
  // dar comissão sobre um valor ainda a receber do cliente não faz sentido.
  const items = itemsRaw.filter(
    (item) => !item.sale.payments.some((p) => p.method === "CREDITO_EFICAZ")
  );

  const itemsByUser = new Map<string, typeof items>();
  for (const item of items) {
    const sellerId = item.sale.sellerId;
    const list = itemsByUser.get(sellerId);
    if (list) list.push(item);
    else itemsByUser.set(sellerId, [item]);
  }

  for (const [sellerId, sellerItems] of itemsByUser) {
    const bySale = new Map<string, MonthlySaleCommission>();
    let cumulative = 0;
    let cumulativeCommission = 0;

    for (const item of sellerItems) {
      const override = productOverrideCommission(item);
      let commission: number;
      if (override !== null) {
        commission = override;
      } else {
        cumulative = round2(cumulative + Number(item.total));
        const newCumulativeCommission = computeProgressiveCommission(cumulative, tierData.tiers).total;
        commission = round2(newCumulativeCommission - cumulativeCommission);
        cumulativeCommission = newCumulativeCommission;
      }

      const existing = bySale.get(item.saleId);
      bySale.set(item.saleId, {
        createdAt: item.sale.createdAt,
        commission: round2((existing?.commission ?? 0) + commission),
      });
    }

    result.set(sellerId, bySale);
  }

  return result;
}

export type SellerMonthlyCommission = {
  monthStartISO: string;
  /** Faturamento total do vendedor no mês (todo produto, com ou sem exceção) — `tierEligibleSales + overrideSales`. */
  totalSales: number;
  /** Faturamento que entra no cálculo progressivo (exclui produto com exceção própria). */
  tierEligibleSales: number;
  /** Faturamento de produtos com exceção própria (fora das faixas) — não conta pra faixa, mas conta pro total vendido. */
  overrideSales: number;
  /** Soma da comissão dos produtos com exceção própria (fora das faixas). */
  overrideCommission: number;
  progressive: ProgressiveCommissionResult;
  /** `overrideCommission + progressive.total`. */
  totalCommission: number;
  tierSetId: string | null;
};

/**
 * Comissão de um vendedor num mês: faturamento com exceção de comissão por
 * produto (`Product.commissionPercent`/`commissionFixedAmount`) soma à parte,
 * fora das faixas; o resto do faturamento entra no cálculo progressivo pelas
 * faixas vigentes daquele mês (`getTierSetForMonth`).
 */
export async function computeSellerMonthlyCommission(
  tenantId: string,
  userId: string,
  monthStartISO: string
): Promise<SellerMonthlyCommission> {
  const { start, end } = monthRange(monthStartISO);
  const effectiveStart = start < COMMISSION_POLICY_EFFECTIVE_AT ? COMMISSION_POLICY_EFFECTIVE_AT : start;

  const [itemsRaw, tierData] = await Promise.all([
    effectiveStart >= end
      ? Promise.resolve([])
      : prisma.saleItem.findMany({
          where: {
            sale: { tenantId, sellerId: userId, status: "COMPLETED", createdAt: { gte: effectiveStart, lt: end } },
          },
          select: {
            total: true,
            quantity: true,
            product: { select: { commissionType: true, commissionPercent: true, commissionFixedAmount: true } },
            sale: { select: { payments: { select: { method: true } } } },
          },
        }),
    getTierSetForMonth(tenantId, monthStartISO),
  ]);
  // Ver nota em `getMonthlySaleCommissionsByUsers`: venda com Crédito Eficaz nunca comissiona.
  const items = itemsRaw.filter((item) => !item.sale.payments.some((p) => p.method === "CREDITO_EFICAZ"));

  const { tierEligibleSales, overrideSales, overrideCommission } = splitOverrideAndTierEligible(items);
  const progressive = computeProgressiveCommission(round2(tierEligibleSales), tierData.tiers);

  return {
    monthStartISO,
    totalSales: round2(tierEligibleSales + overrideSales),
    tierEligibleSales: round2(tierEligibleSales),
    overrideSales: round2(overrideSales),
    overrideCommission: round2(overrideCommission),
    progressive,
    totalCommission: round2(overrideCommission + progressive.total),
    tierSetId: tierData.tierSetId,
  };
}

export type SellerTierProgress = TierProgress & {
  userId: string;
  monthStartISO: string;
  /** Faturamento total do vendedor no mês (todo produto, com ou sem exceção) — `tierEligibleSales + overrideSales`. Use este pra "vendido", não `tierEligibleSales` sozinho. */
  totalSales: number;
  /** Faturamento elegível às faixas no mês (exclui produto com exceção própria). */
  tierEligibleSales: number;
  /** Faturamento de produtos com exceção própria (fora das faixas) — não entra na faixa, mas conta pro total vendido. */
  overrideSales: number;
  /** Comissão de produtos com exceção própria (fora das faixas), no mês. */
  overrideCommission: number;
  /** `overrideCommission + progresso das faixas (TierProgress.total)`. */
  totalCommission: number;
};

/**
 * Progresso nas faixas de TODOS os vendedores pedidos, num mês só — usado
 * pelo Ranking de Comissão pra mostrar a faixa/barra de cada um sem uma
 * consulta por vendedor (o mesmo cálculo de `computeSellerMonthlyCommission`,
 * em lote). A faixa mostrada é sempre a do **mês corrente**, independente do
 * período escolhido no filtro do ranking — faixa é conceito mensal (mesma
 * regra de `getTierSetForMonth`), enquanto a ordenação/comissão efetiva do
 * ranking continua livre pra olhar qualquer período (são coisas diferentes,
 * não confundir posição no ranking com faixa de comissão).
 */
export async function getSellerTierProgressByUsers(
  tenantId: string,
  userIds: string[],
  monthStartISO: string
): Promise<Map<string, SellerTierProgress>> {
  const result = new Map<string, SellerTierProgress>();
  if (userIds.length === 0) return result;

  const { start, end } = monthRange(monthStartISO);
  const effectiveStart = start < COMMISSION_POLICY_EFFECTIVE_AT ? COMMISSION_POLICY_EFFECTIVE_AT : start;

  const [itemsRaw, tierData] = await Promise.all([
    effectiveStart >= end
      ? Promise.resolve([])
      : prisma.saleItem.findMany({
          where: {
            sale: {
              tenantId,
              sellerId: { in: userIds },
              status: "COMPLETED",
              createdAt: { gte: effectiveStart, lt: end },
            },
          },
          select: {
            total: true,
            quantity: true,
            product: { select: { commissionType: true, commissionPercent: true, commissionFixedAmount: true } },
            sale: { select: { sellerId: true, payments: { select: { method: true } } } },
          },
        }),
    getTierSetForMonth(tenantId, monthStartISO),
  ]);
  // Ver nota em `getMonthlySaleCommissionsByUsers`: venda com Crédito Eficaz nunca comissiona.
  const items = itemsRaw.filter((item) => !item.sale.payments.some((p) => p.method === "CREDITO_EFICAZ"));

  const itemsByUser = new Map<string, CommissionableItem[]>();
  for (const item of items) {
    const sellerId = item.sale.sellerId;
    const list = itemsByUser.get(sellerId);
    if (list) list.push(item);
    else itemsByUser.set(sellerId, [item]);
  }

  for (const userId of userIds) {
    const { tierEligibleSales, overrideSales, overrideCommission } = splitOverrideAndTierEligible(
      itemsByUser.get(userId) ?? []
    );
    const progress = computeTierProgress(round2(tierEligibleSales), tierData.tiers);
    result.set(userId, {
      ...progress,
      userId,
      monthStartISO,
      totalSales: round2(tierEligibleSales + overrideSales),
      tierEligibleSales: round2(tierEligibleSales),
      overrideSales: round2(overrideSales),
      overrideCommission: round2(overrideCommission),
      totalCommission: round2(overrideCommission + progress.total),
    });
  }

  return result;
}

export type EditableCommissionTier = CommissionTierInput & { id: string | null; active: boolean };

/**
 * Faixas de um mês específico pra tela de "Configurações de Comissão". Se
 * ainda não existe um conjunto criado especificamente pra esse mês,
 * pré-preenche com o que está vigente agora (inclusive o padrão implícito,
 * se nenhuma faixa foi configurada nunca) — só um ponto de partida pra
 * editar, nada é gravado até salvar.
 */
export async function getEditableTiersForMonth(
  tenantId: string,
  monthStartISO: string
): Promise<{ monthStartISO: string; tierSetId: string | null; tiers: EditableCommissionTier[] }> {
  const { start: monthStart } = monthRange(monthStartISO);

  const explicitSet = await prisma.commissionTierSet.findFirst({
    where: { tenantId, validFrom: monthStart },
    include: { tiers: { orderBy: { order: "asc" } } },
  });

  if (explicitSet) {
    return {
      monthStartISO,
      tierSetId: explicitSet.id,
      tiers: explicitSet.tiers.map((t) => ({
        id: t.id,
        name: t.name,
        order: t.order,
        minAmount: Number(t.minAmount),
        maxAmount: t.maxAmount === null ? null : Number(t.maxAmount),
        percent: Number(t.percent),
        active: t.active,
      })),
    };
  }

  const fallback = await getTierSetForMonth(tenantId, monthStartISO);
  return {
    monthStartISO,
    tierSetId: null,
    tiers: fallback.tiers.map((t) => ({ ...t, id: null, active: true })),
  };
}

/** Faixas do **próximo mês** — nunca o mês em andamento, pra nenhuma edição afetar cálculo já em curso. */
export async function getEditableTiersForNextMonth(
  tenantId: string
): Promise<{ monthStartISO: string; tierSetId: string | null; tiers: EditableCommissionTier[] }> {
  return getEditableTiersForMonth(tenantId, nextMonthStartISO(currentMonthStartISO()));
}

/**
 * Salva as faixas de um mês específico (substitui a lista inteira — mesma
 * convenção de "Oferta Relâmpago"): se já existe um conjunto explícito pra
 * esse mês, atualiza suas faixas; senão, cria um novo.
 *
 * Pro **mês corrente**, só permite quando ainda NÃO existe um conjunto
 * explícito configurado pra ele — é a configuração inicial (única vez;
 * pedido explícito do usuário pra valer imediatamente, não só a partir do
 * próximo mês). A partir do momento em que o mês corrente ganha um conjunto
 * próprio, ele passa a contar como "mês fechado" pra fins de edição — só o
 * próximo mês continua editável dali em diante, preservando a garantia de
 * nunca mudar retroativamente uma comissão que já está em curso.
 */
export async function saveTiersForMonth(
  ctx: { tenantId: string; userId: string },
  monthStartISO: string,
  tiers: Omit<EditableCommissionTier, "id">[]
): Promise<{ tierSetId: string } | { error: string }> {
  const { start: monthStart } = monthRange(monthStartISO);
  const isCurrentMonth = monthStartISO === currentMonthStartISO();

  const existing = await prisma.commissionTierSet.findFirst({
    where: { tenantId: ctx.tenantId, validFrom: monthStart },
    select: { id: true },
  });

  if (isCurrentMonth && !existing) {
    // Primeira configuração do mês corrente — permitida uma vez só; ver doc acima.
  } else if (isCurrentMonth && existing) {
    return { error: "As faixas deste mês já foram configuradas e não podem mais ser alteradas retroativamente." };
  } else if (monthStartISO !== nextMonthStartISO(currentMonthStartISO())) {
    return { error: "Só é possível configurar o mês corrente (uma vez) ou o próximo mês." };
  }

  const tierSetId = await prisma.$transaction(async (tx) => {
    const setId =
      existing?.id ??
      (
        await tx.commissionTierSet.create({
          data: { tenantId: ctx.tenantId, validFrom: monthStart, createdById: ctx.userId },
        })
      ).id;

    await tx.commissionTier.deleteMany({ where: { tierSetId: setId } });
    await tx.commissionTier.createMany({
      data: tiers.map((tier) => ({
        tierSetId: setId,
        name: tier.name,
        order: tier.order,
        minAmount: tier.minAmount,
        maxAmount: tier.maxAmount,
        percent: tier.percent,
        active: tier.active,
      })),
    });

    return setId;
  });

  return { tierSetId };
}

/** Salva as faixas do próximo mês — atalho de `saveTiersForMonth` já resolvendo qual mês é "o próximo". */
export async function saveTiersForNextMonth(
  ctx: { tenantId: string; userId: string },
  tiers: Omit<EditableCommissionTier, "id">[]
): Promise<{ tierSetId: string } | { error: string }> {
  return saveTiersForMonth(ctx, nextMonthStartISO(currentMonthStartISO()), tiers);
}
