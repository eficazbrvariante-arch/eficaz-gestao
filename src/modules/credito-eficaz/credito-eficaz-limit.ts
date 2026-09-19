import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { CreditoEficazLimitChangeReason } from "@/generated/prisma/enums";

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

export type ChangeCreditLimitOptions = {
  /** Motivo gravado no histórico — é o que a tela mostra ("Bônus por pagamento pontual"). */
  reason?: CreditoEficazLimitChangeReason;
  note?: string | null;
  /** Parcela que originou um bônus de pontualidade (trava de idempotência). */
  sourceUsageId?: string | null;
  /**
   * Origem do limite depois desta mudança. `MANUAL` volta o cliente pro
   * fluxo normal (uma decisão humana sempre manda mais que a automática);
   * `CONVENIO` marca a procedência sem criar carteira nenhuma à parte.
   * Omitir não mexe na origem atual.
   */
  source?: { type: "MANUAL" } | { type: "CONVENIO"; convenioId: string };
  /** Carimba `creditoEficazAutoGrantedAt` — só a concessão inicial do convênio usa. */
  markAutoGranted?: boolean;
  /**
   * Deixa o limite cair ABAIXO do que já está utilizado. O padrão continua
   * sendo recusar (comportamento de sempre, protege contra redução
   * acidental); a alteração em massa liga isso de propósito, porque a
   * regra combinada é "reduzir limite nunca apaga dívida — só impede nova
   * utilização". Nesse caso o disponível vai a zero e as obrigações em
   * aberto seguem intactas, valendo o que valiam.
   */
  allowBelowUsed?: boolean;
};

/**
 * Ajusta o limite (dentro da transação de quem chama) — recalcula
 * `creditoEficazAvailableAmount` a partir do que já foi usado (`limite atual
 * - disponível atual`), nunca por incremento/decremento cego, pra nunca
 * divergir. Toda mudança de limite do sistema passa por aqui e deixa uma
 * linha em `CreditoEficazLimitChange`: não existe caminho que mexa em
 * `Customer.creditoEficazLimitAmount` sem histórico.
 */
export async function changeCreditLimitInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerId: string,
  newLimit: number,
  changedById: string,
  options: ChangeCreditLimitOptions = {}
): Promise<SimpleResult> {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  const previousLimit = Number(customer.creditoEficazLimitAmount);
  const used = round2(previousLimit - Number(customer.creditoEficazAvailableAmount));
  if (newLimit < used && !options.allowBelowUsed) {
    return {
      ok: false,
      error: `Não é possível reduzir o limite abaixo do valor já utilizado (R$ ${used.toFixed(2)}).`,
    };
  }

  const sourceData =
    options.source?.type === "CONVENIO"
      ? {
          creditoEficazSource: "CONVENIO" as const,
          creditoEficazSourceConvenioId: options.source.convenioId,
        }
      : options.source?.type === "MANUAL"
        ? { creditoEficazSource: "MANUAL" as const, creditoEficazSourceConvenioId: null }
        : {};

  await tx.customer.update({
    where: { id: customerId },
    data: {
      creditoEficazLimitAmount: newLimit,
      // Nunca negativo: quando a redução passa do que já foi usado, o
      // disponível zera e a dívida continua registrada nas obrigações.
      creditoEficazAvailableAmount: Math.max(0, round2(newLimit - used)),
      ...sourceData,
      ...(options.markAutoGranted ? { creditoEficazAutoGrantedAt: new Date() } : {}),
    },
  });
  await tx.creditoEficazLimitChange.create({
    data: {
      tenantId,
      customerId,
      previousLimit,
      newLimit,
      changedById,
      note: options.note ?? null,
      reason: options.reason ?? "MANUAL_ADJUSTMENT",
      sourceUsageId: options.sourceUsageId ?? null,
    },
  });
  return { ok: true };
}

/** Versão fora de transação — abre a sua própria. */
export async function changeCreditLimit(
  tenantId: string,
  customerId: string,
  newLimit: number,
  changedById: string,
  options: ChangeCreditLimitOptions = {}
): Promise<SimpleResult> {
  return prisma.$transaction((tx) => changeCreditLimitInTx(tx, tenantId, customerId, newLimit, changedById, options));
}
