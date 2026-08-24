import { prisma } from "@/lib/prisma";
import { currentMonthStartISO, monthRange, nextMonthStartISO } from "@/lib/format";
import {
  computeProgressiveCommission,
  type CommissionTierInput,
  type ProgressiveCommissionResult,
} from "@/lib/commission-tiers";
import { COMMISSION_POLICY_EFFECTIVE_AT_ISO } from "./commission-service";

export { computeProgressiveCommission } from "@/lib/commission-tiers";
export type {
  CommissionTierInput,
  CommissionTierBreakdownRow,
  ProgressiveCommissionResult,
} from "@/lib/commission-tiers";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Mesmo corte de `commission-service.ts` — nenhuma comissão (faixa ou exceção por produto) existe antes da alíquota única entrar em vigor. */
const COMMISSION_POLICY_EFFECTIVE_AT = new Date(`${COMMISSION_POLICY_EFFECTIVE_AT_ISO}T00:00:00-03:00`);

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

export type EditableCommissionTier = CommissionTierInput & { id: string | null; active: boolean };

/**
 * Faixas pra tela de "Configurações de Comissão" — sempre as do **mês
 * seguinte** (nunca o mês em andamento, pra nenhuma edição afetar cálculo já
 * em curso, e nunca um mês fechado, que já virou histórico). Se ainda não
 * existe um conjunto criado especificamente pro próximo mês, pré-preenche
 * com o que está vigente agora (inclusive o padrão implícito, se nenhuma
 * faixa foi configurada nunca) — só um ponto de partida pra editar, nada é
 * gravado até salvar.
 */
export async function getEditableTiersForNextMonth(
  tenantId: string
): Promise<{ monthStartISO: string; tierSetId: string | null; tiers: EditableCommissionTier[] }> {
  const nextMonth = nextMonthStartISO(currentMonthStartISO());
  const { start: nextMonthStart } = monthRange(nextMonth);

  const explicitNextMonthSet = await prisma.commissionTierSet.findFirst({
    where: { tenantId, validFrom: nextMonthStart },
    include: { tiers: { orderBy: { order: "asc" } } },
  });

  if (explicitNextMonthSet) {
    return {
      monthStartISO: nextMonth,
      tierSetId: explicitNextMonthSet.id,
      tiers: explicitNextMonthSet.tiers.map((t) => ({
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

  const fallback = await getTierSetForMonth(tenantId, nextMonth);
  return {
    monthStartISO: nextMonth,
    tierSetId: null,
    tiers: fallback.tiers.map((t) => ({ ...t, id: null, active: true })),
  };
}

/**
 * Salva as faixas do próximo mês (substitui a lista inteira — mesma
 * convenção de "Oferta Relâmpago"). Nunca mexe no conjunto do mês atual nem
 * de qualquer mês passado: se já existe um conjunto explícito pro próximo
 * mês, atualiza suas faixas; senão, cria um novo. Não recalcula nem afeta o
 * mês em andamento de nenhuma forma.
 */
export async function saveTiersForNextMonth(
  ctx: { tenantId: string; userId: string },
  tiers: Omit<EditableCommissionTier, "id">[]
): Promise<{ tierSetId: string }> {
  const nextMonth = nextMonthStartISO(currentMonthStartISO());
  const { start: nextMonthStart } = monthRange(nextMonth);

  const existing = await prisma.commissionTierSet.findFirst({
    where: { tenantId: ctx.tenantId, validFrom: nextMonthStart },
    select: { id: true },
  });

  const tierSetId = await prisma.$transaction(async (tx) => {
    const setId =
      existing?.id ??
      (
        await tx.commissionTierSet.create({
          data: { tenantId: ctx.tenantId, validFrom: nextMonthStart, createdById: ctx.userId },
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
