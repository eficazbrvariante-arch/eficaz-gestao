"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canEditCommission } from "@/lib/permissions";
import { saveTiersForNextMonth } from "@/modules/employees/commission-tier-service";
import { saveCommissionTiersSchema, type SaveCommissionTiersInput } from "@/lib/validations/commission-tiers";
import { recordAudit } from "@/modules/audit/audit-service";
import { formatBRL } from "@/lib/format";

/**
 * Salva as faixas de comissão progressiva do **próximo mês** — nunca o mês
 * em andamento nem qualquer mês fechado (ver `saveTiersForNextMonth`). Só
 * ADMIN (mesma trava de sempre pra decidir quanto cada um ganha).
 */
export async function saveCommissionTiersAction(input: SaveCommissionTiersInput) {
  const user = await requireUser();
  if (!canEditCommission(user.role)) {
    return { error: "Seu perfil não tem permissão para configurar as faixas de comissão." };
  }

  const parsed = saveCommissionTiersSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { tierSetId } = await saveTiersForNextMonth(
    { tenantId: user.tenantId, userId: user.id },
    parsed.data.tiers
  );

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
    entityId: tierSetId,
    description: `${user.name} configurou as faixas de comissão a partir do próximo mês: ${summary}`,
  });

  revalidatePath("/colaboradores/ranking-comissao/configuracoes");
  return { success: "Faixas salvas — valem a partir do próximo mês." };
}
