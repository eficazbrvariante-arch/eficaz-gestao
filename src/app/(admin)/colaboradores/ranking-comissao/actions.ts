"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canEditCommission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { saveTiersForMonth } from "@/modules/employees/commission-tier-service";
import { saveCommissionTiersSchema, type SaveCommissionTiersInput } from "@/lib/validations/commission-tiers";
import { recordAudit } from "@/modules/audit/audit-service";
import { formatBRL, currentMonthStartISO, nextMonthStartISO } from "@/lib/format";

/**
 * Salva as faixas de comissão progressiva — do **mês corrente** (só permitido
 * uma vez, a primeira configuração; ver `saveTiersForMonth`) ou do **próximo
 * mês** (sempre editável). Só ADMIN (mesma trava de sempre pra decidir
 * quanto cada um ganha).
 */
export async function saveCommissionTiersAction(input: SaveCommissionTiersInput) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar as faixas de comissão." };
  }

  const parsed = saveCommissionTiersSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const monthStartISO =
    parsed.data.target === "current" ? currentMonthStartISO() : nextMonthStartISO(currentMonthStartISO());

  const result = await saveTiersForMonth(
    { tenantId: user.tenantId, userId: user.id },
    monthStartISO,
    parsed.data.tiers
  );
  if ("error" in result) return { error: result.error };

  const summary = parsed.data.tiers
    .filter((t) => t.active)
    .map((t) => `${t.name} (${formatBRL(t.minAmount)}${t.maxAmount === null ? "+" : ` a ${formatBRL(t.maxAmount)}`} = ${t.percent}%)`)
    .join(", ");

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    action: "commission.tiers_update",
    entity: "CommissionTierSet",
    entityId: result.tierSetId,
    description:
      parsed.data.target === "current"
        ? `${user.name} configurou as faixas de comissão do mês corrente (vigência imediata): ${summary}`
        : `${user.name} configurou as faixas de comissão a partir do próximo mês: ${summary}`,
  });

  revalidatePath("/colaboradores/ranking-comissao/configuracoes");
  return {
    success:
      parsed.data.target === "current"
        ? "Faixas salvas — já valem para o mês corrente."
        : "Faixas salvas — valem a partir do próximo mês.",
  };
}

/**
 * Liga/desliga o Ranking de Comissão no rodapé do PDV. Fica permanente
 * (ligado por padrão, visível em todo PDV independente da conta logada) —
 * este botão é o interruptor pro Admin desligar temporariamente quando
 * quiser (ex.: pra não gerar expectativa durante o dia) e religar depois.
 * Nunca afeta o Ranking do painel administrativo.
 */
export async function setPdvRankingEnabledAction(enabled: boolean) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para ligar/desligar o Ranking no PDV." };
  }

  await prisma.tenant.update({ where: { id: user.tenantId }, data: { pdvRankingEnabled: enabled } });

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    action: "commission.pdv_ranking_toggle",
    entity: "Tenant",
    entityId: user.tenantId,
    description: `${user.name} ${enabled ? "ligou" : "desligou"} o Ranking de Comissão no rodapé do PDV`,
  });

  revalidatePath("/colaboradores/ranking-comissao");
  revalidatePath("/pdv");
  return { success: enabled ? "Ranking ligado no PDV." : "Ranking desligado no PDV." };
}
