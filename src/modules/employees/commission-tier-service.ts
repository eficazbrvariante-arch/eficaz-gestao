import { prisma } from "@/lib/prisma";
import { monthRange } from "@/lib/format";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Mesmo corte de `commission-service.ts` — nenhuma comissão (faixa ou
 * exceção por produto) existe antes da alíquota única entrar em vigor.
 * Repetido aqui (não importado) porque `commission-service.ts` não exporta
 * a constante; ambos os motores precisam do mesmo corte, então documentado
 * nos dois lugares.
 */
const COMMISSION_POLICY_EFFECTIVE_AT = new Date("2026-08-21T00:00:00-03:00");

export type CommissionTierInput = {
  name: string;
  order: number;
  minAmount: number;
  /** `null` = sem teto (última faixa). */
  maxAmount: number | null;
  percent: number;
};

export type CommissionTierBreakdownRow = {
  name: string;
  minAmount: number;
  maxAmount: number | null;
  percent: number;
  /** Quanto do faturamento caiu dentro desta faixa (pode ser 0 se o vendedor não chegou nela). */
  amountInTier: number;
  /** `amountInTier * percent / 100`. */
  commission: number;
};

export type ProgressiveCommissionResult = {
  breakdown: CommissionTierBreakdownRow[];
  total: number;
};

/**
 * Cálculo progressivo por faixas — função central e pura (sem banco), usada
 * pelo cálculo real do mês, pelo ranking e pelo simulador do Admin, sempre a
 * mesma, nunca duplicada. Cada faixa comissiona só a fatia do faturamento que
 * cai dentro dela (marginal/progressivo, nunca a alíquota da faixa mais alta
 * sobre o total inteiro).
 *
 * Exemplo do pedido: R$20.000 em faixas 0–8000@1% / 8000–14000@2% /
 * 14000+@2,8% → R$80 + R$120 + R$168 = R$368.
 */
export function computeProgressiveCommission(
  totalSales: number,
  tiers: CommissionTierInput[]
): ProgressiveCommissionResult {
  const sorted = [...tiers].sort((a, b) => a.order - b.order || a.minAmount - b.minAmount);
  const breakdown: CommissionTierBreakdownRow[] = sorted.map((tier) => {
    const upper = tier.maxAmount === null ? totalSales : Math.min(totalSales, tier.maxAmount);
    const amountInTier = round2(Math.max(0, upper - tier.minAmount));
    const commission = round2((amountInTier * tier.percent) / 100);
    return {
      name: tier.name,
      minAmount: tier.minAmount,
      maxAmount: tier.maxAmount,
      percent: tier.percent,
      amountInTier,
      commission,
    };
  });

  return { breakdown, total: round2(breakdown.reduce((sum, row) => sum + row.commission, 0)) };
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

export type SellerMonthlyCommission = {
  monthStartISO: string;
  /** Faturamento total do vendedor no mês (todo produto, com ou sem exceção). */
  totalSales: number;
  /** Faturamento que entra no cálculo progressivo (exclui produto com exceção própria). */
  tierEligibleSales: number;
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

  const [items, tierData] = await Promise.all([
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
          },
        }),
    getTierSetForMonth(tenantId, monthStartISO),
  ]);

  let totalSales = 0;
  let tierEligibleSales = 0;
  let overrideCommission = 0;

  for (const item of items) {
    const itemTotal = Number(item.total);
    totalSales += itemTotal;

    const hasOverride =
      (item.product.commissionType === "FIXED" && item.product.commissionFixedAmount != null) ||
      item.product.commissionPercent != null;

    if (hasOverride) {
      overrideCommission +=
        item.product.commissionType === "FIXED" && item.product.commissionFixedAmount != null
          ? Number(item.product.commissionFixedAmount) * item.quantity
          : (itemTotal * Number(item.product.commissionPercent)) / 100;
    } else {
      tierEligibleSales += itemTotal;
    }
  }

  const progressive = computeProgressiveCommission(round2(tierEligibleSales), tierData.tiers);

  return {
    monthStartISO,
    totalSales: round2(totalSales),
    tierEligibleSales: round2(tierEligibleSales),
    overrideCommission: round2(overrideCommission),
    progressive,
    totalCommission: round2(overrideCommission + progressive.total),
    tierSetId: tierData.tierSetId,
  };
}
