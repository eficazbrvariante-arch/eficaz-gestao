import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { startOfMonthISO, todayISO } from "@/lib/format";

/**
 * Custo do bcrypt pro PIN de confirmação — mesmo custo usado pra senha de
 * cliente (`customer-service.ts`). PIN tem baixa entropia (4 dígitos), por
 * isso usa bcrypt (lento, salgado) em vez do SHA-256 sem sal de
 * `hashToken` (`lib/tokens.ts`) — aquele padrão só é seguro pra token
 * aleatório de alta entropia; um PIN de 4 dígitos com SHA-256 puro seria
 * trivial de reverter por força bruta caso o banco vazasse.
 */
const PIN_COST = 12;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Solicitação (lado do cliente)
// ---------------------------------------------------------------------------

export type CreditoEficazApplicationDraftInput = {
  occupation?: string | null;
  income?: number | null;
  bestDueDay?: number | null;
  additionalNotes?: string | null;
};

const EDITABLE_STATUSES = ["DRAFT", "INFO_REQUESTED"] as const;
const ACTIVE_STATUSES = ["UNDER_REVIEW", "APPROVED"] as const;

/** Solicitação editável do cliente (rascunho ou com pendência de informação), se houver. */
export async function getEditableApplication(tenantId: string, customerId: string) {
  return prisma.creditoEficazApplication.findFirst({
    where: { tenantId, customerId, status: { in: [...EDITABLE_STATUSES] } },
    include: { documents: { select: { id: true, type: true, uploadedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export type GetOrCreateDraftResult =
  | { ok: true; application: NonNullable<Awaited<ReturnType<typeof getEditableApplication>>> }
  | { ok: false; error: string };

/**
 * Retoma o rascunho em andamento ou abre um novo — nunca duas solicitações
 * editáveis ao mesmo tempo, e nunca uma nova enquanto já existe uma em
 * análise ou já aprovada (pedido explícito: "poucos clientes selecionados",
 * uma solicitação de cada vez por cliente).
 */
export async function getOrCreateDraftApplication(
  tenantId: string,
  customerId: string
): Promise<GetOrCreateDraftResult> {
  const active = await prisma.creditoEficazApplication.findFirst({
    where: { tenantId, customerId, status: { in: [...ACTIVE_STATUSES] } },
    select: { id: true },
  });
  if (active) {
    return {
      ok: false,
      error: "Você já tem uma solicitação de Crédito Eficaz em análise ou aprovada.",
    };
  }

  const editable = await getEditableApplication(tenantId, customerId);
  if (editable) return { ok: true, application: editable };

  const created = await prisma.creditoEficazApplication.create({
    data: { tenantId, customerId },
    include: { documents: { select: { id: true, type: true, uploadedAt: true } } },
  });
  return { ok: true, application: created };
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** Atualiza os dados do formulário — só enquanto a solicitação ainda está editável. */
export async function updateDraftApplication(
  tenantId: string,
  customerId: string,
  applicationId: string,
  input: CreditoEficazApplicationDraftInput
): Promise<SimpleResult> {
  const result = await prisma.creditoEficazApplication.updateMany({
    where: { id: applicationId, tenantId, customerId, status: { in: [...EDITABLE_STATUSES] } },
    data: {
      occupation: input.occupation ?? null,
      income: input.income ?? null,
      bestDueDay: input.bestDueDay ?? null,
      additionalNotes: input.additionalNotes ?? null,
    },
  });
  if (result.count === 0) {
    return { ok: false, error: "Solicitação não encontrada ou não está mais editável." };
  }
  return { ok: true };
}

/** Anexa um documento — reenvio soma uma linha nova, nunca sobrescreve a anterior (nada some). */
export async function addApplicationDocument(
  tenantId: string,
  customerId: string,
  applicationId: string,
  type: "ID_DOCUMENT" | "RESIDENCE_PROOF" | "SELFIE",
  blobPathname: string
): Promise<SimpleResult> {
  const application = await prisma.creditoEficazApplication.findFirst({
    where: { id: applicationId, tenantId, customerId, status: { in: [...EDITABLE_STATUSES] } },
    select: { id: true },
  });
  if (!application) {
    return { ok: false, error: "Solicitação não encontrada ou não está mais editável." };
  }

  await prisma.creditoEficazDocument.create({
    data: { tenantId, applicationId, type, blobPathname },
  });
  return { ok: true };
}

const REQUIRED_DOCUMENT_TYPES = ["ID_DOCUMENT", "RESIDENCE_PROOF", "SELFIE"] as const;

/** Envia pra análise: exige os três documentos e o aceite explícito dos termos vigentes. */
export async function submitApplication(
  tenantId: string,
  customerId: string,
  applicationId: string,
  termsVersion: string
): Promise<SimpleResult> {
  const application = await prisma.creditoEficazApplication.findFirst({
    where: { id: applicationId, tenantId, customerId, status: { in: [...EDITABLE_STATUSES] } },
    include: { documents: { select: { type: true } } },
  });
  if (!application) {
    return { ok: false, error: "Solicitação não encontrada ou não está mais editável." };
  }

  const presentTypes = new Set(application.documents.map((d) => d.type));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !presentTypes.has(t));
  if (missing.length > 0) {
    return { ok: false, error: `Faltam documentos: ${missing.join(", ")}.` };
  }

  await prisma.creditoEficazApplication.update({
    where: { id: applicationId },
    data: {
      status: "UNDER_REVIEW",
      termsVersion,
      termsAcceptedAt: new Date(),
      submittedAt: new Date(),
    },
  });
  return { ok: true };
}

/** PIN definido pelo próprio cliente no aceite — confirmação de uso no PDV (ver `verifyCreditoEficazPin`). */
export async function setCreditoEficazPin(
  tenantId: string,
  customerId: string,
  pin: string
): Promise<SimpleResult> {
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, error: "O PIN precisa ter exatamente 4 dígitos." };
  }
  const pinHash = await bcrypt.hash(pin, PIN_COST);
  const result = await prisma.customer.updateMany({
    where: { id: customerId, tenantId },
    data: { creditoEficazPinHash: pinHash, creditoEficazPinSetAt: new Date() },
  });
  if (result.count === 0) return { ok: false, error: "Cliente não encontrado." };
  return { ok: true };
}

/** Confere o PIN no momento do uso no PDV. `false` também quando o cliente nunca definiu um PIN. */
export async function verifyCreditoEficazPin(
  tenantId: string,
  customerId: string,
  pin: string
): Promise<boolean> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { creditoEficazPinHash: true },
  });
  if (!customer?.creditoEficazPinHash) return false;
  return bcrypt.compare(pin, customer.creditoEficazPinHash);
}

// ---------------------------------------------------------------------------
// Admin: fila e decisão
// ---------------------------------------------------------------------------

export async function listApplicationsForAdmin(tenantId: string) {
  return prisma.creditoEficazApplication.findMany({
    where: { tenantId },
    include: {
      customer: { select: { id: true, name: true, eficazNumber: true, phone: true } },
      documents: { select: { id: true, type: true, uploadedAt: true } },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }, { createdAt: "asc" }],
  });
}

export async function getApplicationForAdmin(tenantId: string, applicationId: string) {
  return prisma.creditoEficazApplication.findFirst({
    where: { id: applicationId, tenantId },
    include: {
      customer: true,
      documents: { select: { id: true, type: true, uploadedAt: true } },
      reviewedBy: { select: { name: true } },
    },
  });
}

const PENDING_DECISION_STATUSES = ["UNDER_REVIEW", "INFO_REQUESTED"] as const;

/**
 * Ajusta o limite (dentro da mesma transação de quem chama) — recalcula
 * `creditoEficazAvailableAmount` a partir do que já foi usado (`limite atual
 * - disponível atual`), nunca por incremento/decremento cego, pra nunca
 * divergir. Nunca deixa reduzir o limite abaixo do que já está em uso.
 */
async function changeCreditLimitInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerId: string,
  newLimit: number,
  changedById: string,
  note?: string | null
): Promise<SimpleResult> {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  const previousLimit = Number(customer.creditoEficazLimitAmount);
  const used = round2(previousLimit - Number(customer.creditoEficazAvailableAmount));
  if (newLimit < used) {
    return {
      ok: false,
      error: `Não é possível reduzir o limite abaixo do valor já utilizado (R$ ${used.toFixed(2)}).`,
    };
  }

  await tx.customer.update({
    where: { id: customerId },
    data: {
      creditoEficazLimitAmount: newLimit,
      creditoEficazAvailableAmount: round2(newLimit - used),
    },
  });
  await tx.creditoEficazLimitChange.create({
    data: { tenantId, customerId, previousLimit, newLimit, changedById, note: note ?? null },
  });
  return { ok: true };
}

/** Aprova a solicitação e concede o limite definido manualmente pelo Admin. */
export async function approveApplication(
  tenantId: string,
  applicationId: string,
  adminUserId: string,
  limitAmount: number,
  note?: string | null,
  /** Onda/lote de entrada no programa (Adendo) — texto livre, opcional. */
  wave?: string | null
): Promise<SimpleResult> {
  if (limitAmount <= 0) return { ok: false, error: "O limite precisa ser maior que zero." };

  return prisma.$transaction(async (tx) => {
    const application = await tx.creditoEficazApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { status: true, customerId: true },
    });
    if (!application) return { ok: false, error: "Solicitação não encontrada." };
    if (!PENDING_DECISION_STATUSES.includes(application.status as (typeof PENDING_DECISION_STATUSES)[number])) {
      return { ok: false, error: "Esta solicitação já foi decidida." };
    }

    const limitResult = await changeCreditLimitInTx(
      tx,
      tenantId,
      application.customerId,
      limitAmount,
      adminUserId,
      note
    );
    if (!limitResult.ok) return limitResult;

    await tx.creditoEficazApplication.update({
      where: { id: applicationId },
      data: {
        status: "APPROVED",
        approvedLimitAmount: limitAmount,
        reviewedById: adminUserId,
        reviewedAt: new Date(),
        decisionNote: note ?? null,
        wave: wave || null,
      },
    });
    return { ok: true };
  });
}

export async function rejectApplication(
  tenantId: string,
  applicationId: string,
  adminUserId: string,
  reason: string
): Promise<SimpleResult> {
  const result = await prisma.creditoEficazApplication.updateMany({
    where: { id: applicationId, tenantId, status: { in: [...PENDING_DECISION_STATUSES] } },
    data: { status: "REJECTED", decisionNote: reason, reviewedById: adminUserId, reviewedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Solicitação não encontrada ou já decidida." };
  }
  return { ok: true };
}

export async function requestApplicationInfo(
  tenantId: string,
  applicationId: string,
  adminUserId: string,
  note: string
): Promise<SimpleResult> {
  const result = await prisma.creditoEficazApplication.updateMany({
    where: { id: applicationId, tenantId, status: { in: [...PENDING_DECISION_STATUSES] } },
    data: { status: "INFO_REQUESTED", decisionNote: note, reviewedById: adminUserId, reviewedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Solicitação não encontrada ou já decidida." };
  }
  return { ok: true };
}

/** Define/altera o limite de uma conta já aprovada (fora do fluxo de uma solicitação). */
export async function setCreditLimit(
  tenantId: string,
  customerId: string,
  adminUserId: string,
  newLimit: number,
  note?: string | null
): Promise<SimpleResult> {
  if (newLimit < 0) return { ok: false, error: "O limite não pode ser negativo." };
  return prisma.$transaction((tx) => changeCreditLimitInTx(tx, tenantId, customerId, newLimit, adminUserId, note));
}

export async function blockCustomerCredit(
  tenantId: string,
  customerId: string,
  reason: string
): Promise<SimpleResult> {
  const result = await prisma.customer.updateMany({
    where: { id: customerId, tenantId },
    data: { creditoEficazBlocked: true, creditoEficazBlockedReason: reason },
  });
  if (result.count === 0) return { ok: false, error: "Cliente não encontrado." };
  return { ok: true };
}

export async function unblockCustomerCredit(tenantId: string, customerId: string): Promise<SimpleResult> {
  const result = await prisma.customer.updateMany({
    where: { id: customerId, tenantId },
    data: { creditoEficazBlocked: false, creditoEficazBlockedReason: null },
  });
  if (result.count === 0) return { ok: false, error: "Cliente não encontrado." };
  return { ok: true };
}

/** Reset de PIN esquecido, feito pelo Admin — mesmo espírito de `adminSetCustomerPassword`. */
export async function adminResetCreditoEficazPin(
  tenantId: string,
  customerId: string,
  newPin: string
): Promise<SimpleResult> {
  return setCreditoEficazPin(tenantId, customerId, newPin);
}

// ---------------------------------------------------------------------------
// Configuração do programa (Adendo — controle e saúde da carteira)
// ---------------------------------------------------------------------------

/** Teto global de exposição — `null` desliga a trava (comportamento de antes do Adendo). */
export async function setCreditoEficazExposureLimit(
  tenantId: string,
  limit: number | null
): Promise<SimpleResult> {
  if (limit != null && limit < 0) return { ok: false, error: "O teto não pode ser negativo." };
  await prisma.tenant.update({ where: { id: tenantId }, data: { creditoEficazExposureLimit: limit } });
  return { ok: true };
}

/** Pausa de emergência — bloqueia só novo débito (ver `debitCreditoEficazInTx`), nunca o que já existe. */
export async function setCreditoEficazPaused(tenantId: string, paused: boolean): Promise<SimpleResult> {
  await prisma.tenant.update({ where: { id: tenantId }, data: { creditoEficazPaused: paused } });
  return { ok: true };
}

/** Parcelas máximas ao financiar o saldo de uma OS — nunca hardcoded na tela (Adendo). */
export async function setCreditoEficazMaxInstallments(
  tenantId: string,
  maxInstallments: number
): Promise<SimpleResult> {
  if (!Number.isInteger(maxInstallments) || maxInstallments < 1 || maxInstallments > 12) {
    return { ok: false, error: "Informe um número de parcelas entre 1 e 12." };
  }
  await prisma.tenant.update({ where: { id: tenantId }, data: { creditoEficazMaxInstallments: maxInstallments } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Uso no PDV (débito atômico) — chamado por `sale-service.ts` (Fase 6)
// ---------------------------------------------------------------------------

export type DebitCreditoEficazResult =
  | { ok: true; availableBefore: number; availableAfter: number }
  | { ok: false; error: string };

/**
 * Débito atômico do saldo disponível, sempre dentro da transação de quem
 * chama. A condição de saldo suficiente mora no próprio `WHERE` do
 * `UPDATE` (nunca um `SELECT` solto seguido de `UPDATE` cego, que é a
 * fragilidade real que já existe em `STORE_CREDIT` — ver
 * `sale-service.ts`) — duas chamadas concorrentes pro mesmo cliente nunca
 * conseguem as duas passar: o Postgres serializa os `UPDATE`s na mesma
 * linha, a segunda só enxerga o valor já debitado pela primeira.
 */
export async function debitCreditoEficazInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerId: string,
  amount: number
): Promise<DebitCreditoEficazResult> {
  // Pausa de emergência (Adendo — "botão de pausa"): bloqueia só NOVO
  // débito, aqui, no único choque-lugar por onde toda utilização passa
  // (PDV e financiamento de OS). Pagamentos/estornos/consulta continuam
  // funcionando normalmente, sem passar por aqui.
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { creditoEficazPaused: true, creditoEficazExposureLimit: true },
  });
  if (tenant.creditoEficazPaused) {
    return { ok: false, error: "Novas utilizações do Crédito Eficaz estão pausadas no momento." };
  }

  // Teto global de exposição (Adendo): simplificação deliberada — lê a
  // exposição agregada AO VIVO dentro desta transação (não é um contador
  // mantido à parte). Protege contra o caso comum (uma utilização de cada
  // vez); numa disputa rara entre CLIENTES DIFERENTES no mesmíssimo
  // instante, o teto pode ser cruzado por um valor pequeno antes de
  // estabilizar — aceitável no volume de um piloto com poucos clientes e
  // aprovação manual (decisão confirmada com o usuário).
  if (tenant.creditoEficazExposureLimit != null) {
    const exposureAgg = await tx.customer.aggregate({
      where: { tenantId },
      _sum: { creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
    });
    const currentExposure = round2(
      Number(exposureAgg._sum.creditoEficazLimitAmount ?? 0) -
        Number(exposureAgg._sum.creditoEficazAvailableAmount ?? 0)
    );
    if (round2(currentExposure + amount) > Number(tenant.creditoEficazExposureLimit) + 0.005) {
      return { ok: false, error: "Teto global do programa Crédito Eficaz atingido." };
    }
  }

  const before = await tx.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { creditoEficazAvailableAmount: true },
  });
  if (!before) return { ok: false, error: "Cliente não encontrado." };
  const availableBefore = Number(before.creditoEficazAvailableAmount);

  const debited = await tx.customer.updateMany({
    where: {
      id: customerId,
      tenantId,
      creditoEficazBlocked: false,
      creditoEficazAvailableAmount: { gte: amount },
    },
    data: { creditoEficazAvailableAmount: { decrement: amount } },
  });
  if (debited.count === 0) {
    return { ok: false, error: "Limite disponível insuficiente." };
  }

  return { ok: true, availableBefore, availableAfter: round2(availableBefore - amount) };
}

/** Próxima ocorrência do dia (1-28) a partir de `from` — se já passou esse dia no mês corrente, usa o mês seguinte. */
function nextOccurrenceOfDay(day: number, from: Date): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), day, 12, 0, 0);
  if (candidate <= from) return new Date(from.getFullYear(), from.getMonth() + 1, day, 12, 0, 0);
  return candidate;
}

const DEFAULT_DUE_DAYS = 30;

/**
 * Vencimento de uma nova obrigação: usa o "melhor dia de vencimento" da
 * solicitação aprovada do cliente, se houver (próxima ocorrência a partir de
 * hoje); sem isso, cai no padrão de 30 dias. Chamado por `sale-service.ts`
 * ao registrar o uso no PDV.
 */
export async function computeCreditoEficazDueDate(tenantId: string, customerId: string): Promise<Date> {
  const now = new Date();
  const approved = await prisma.creditoEficazApplication.findFirst({
    where: { tenantId, customerId, status: "APPROVED", bestDueDay: { not: null } },
    orderBy: { reviewedAt: "desc" },
    select: { bestDueDay: true },
  });
  if (approved?.bestDueDay) return nextOccurrenceOfDay(approved.bestDueDay, now);
  return new Date(now.getTime() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);
}

export type RecordUsageResult = { ok: true; usageId: string } | { ok: false; error: string };

/** Débito + registro da obrigação, dentro da mesma transação da venda. */
export async function recordCreditoEficazUsageInTx(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    customerId: string;
    saleId: string;
    amount: number;
    dueDate: Date;
    operatorId: string;
  }
): Promise<RecordUsageResult> {
  const debited = await debitCreditoEficazInTx(tx, params.tenantId, params.customerId, params.amount);
  if (!debited.ok) return debited;

  const usage = await tx.creditoEficazUsage.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      saleId: params.saleId,
      amount: params.amount,
      availableBefore: debited.availableBefore,
      availableAfter: debited.availableAfter,
      dueDate: params.dueDate,
      operatorId: params.operatorId,
    },
    select: { id: true },
  });
  return { ok: true, usageId: usage.id };
}

/** Estorno (venda cancelada): devolve o valor ao disponível e marca a obrigação como cancelada — nunca some. */
export async function reverseCreditoEficazUsageInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  saleId: string
): Promise<void> {
  const usage = await tx.creditoEficazUsage.findFirst({
    where: { saleId, tenantId },
    select: { id: true, customerId: true, amount: true, status: true },
  });
  if (!usage || usage.status === "CANCELLED") return;

  await tx.customer.update({
    where: { id: usage.customerId },
    data: { creditoEficazAvailableAmount: { increment: Number(usage.amount) } },
  });
  await tx.creditoEficazUsage.update({ where: { id: usage.id }, data: { status: "CANCELLED" } });
}

// ---------------------------------------------------------------------------
// Crédito Eficaz na Assistência Técnica (Adendo) — financiamento de OS
// ---------------------------------------------------------------------------

export type FinanceRepairOrderResult =
  | { ok: true; financingId: string; usageIds: string[] }
  | { ok: false; error: string };

/**
 * Financia o SALDO de uma OS com Crédito Eficaz: debita a SOMA das
 * parcelas de uma vez só (reusa `debitCreditoEficazInTx` — mesmo guard de
 * pausa/teto/saldo/bloqueio de qualquer outro débito), cria o "contrato"
 * (`CreditoEficazServiceFinancing`) e uma `CreditoEficazUsage` por parcela.
 * Chamado por `repair-payment-service.ts`, sempre DEPOIS de já ter criado
 * o `RepairOrderPayment` que fecha o saldo da OS na hora (mesmo padrão já
 * usado por `FIADO` — a OS pode ser entregue mesmo com o dinheiro ainda
 * por vir, porque a promessa de pagamento já está registrada).
 */
export async function financeRepairOrderBalanceInTx(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    customerId: string;
    repairOrderId: string;
    totalAmount: number;
    downPayment: number;
    installments: { amount: number; dueDate: Date }[];
    createdById: string;
    wouldBeLostWithoutCredit?: boolean | null;
  }
): Promise<FinanceRepairOrderResult> {
  const financedAmount = round2(params.installments.reduce((sum, i) => sum + i.amount, 0));
  if (financedAmount <= 0) return { ok: false, error: "Nenhum valor a financiar." };

  const debited = await debitCreditoEficazInTx(tx, params.tenantId, params.customerId, financedAmount);
  if (!debited.ok) return debited;

  const financing = await tx.creditoEficazServiceFinancing.create({
    data: {
      tenantId: params.tenantId,
      repairOrderId: params.repairOrderId,
      customerId: params.customerId,
      totalAmount: params.totalAmount,
      downPayment: params.downPayment,
      financedAmount,
      installmentCount: params.installments.length,
      wouldBeLostWithoutCredit: params.wouldBeLostWithoutCredit ?? null,
      createdById: params.createdById,
    },
    select: { id: true },
  });

  const usageIds: string[] = [];
  for (const [index, installment] of params.installments.entries()) {
    const usage = await tx.creditoEficazUsage.create({
      data: {
        tenantId: params.tenantId,
        customerId: params.customerId,
        financingId: financing.id,
        installmentNumber: index + 1,
        installmentCount: params.installments.length,
        amount: installment.amount,
        // Snapshot do débito único que cobriu todas as parcelas — não é
        // "antes/depois desta parcela específica", é o antes/depois do
        // financiamento inteiro (simplificação deliberada, mesmo espírito
        // de outras simplificações já documentadas neste módulo).
        availableBefore: debited.availableBefore,
        availableAfter: debited.availableAfter,
        dueDate: installment.dueDate,
        operatorId: params.createdById,
      },
      select: { id: true },
    });
    usageIds.push(usage.id);
  }

  return { ok: true, financingId: financing.id, usageIds };
}

/**
 * Cortesia numa OS com financiamento ativo (Adendo): devolve ao disponível
 * só a fatia AINDA NÃO PAGA de cada parcela `OPEN` (nunca mexe em parcela
 * já `PAID` nem devolve o que já foi recebido) e marca como `CANCELLED` —
 * coerente com "o serviço foi de graça, o cliente não continua devendo por
 * ele". Chamado por `grantRepairOrderCourtesy` antes de aplicar o desconto
 * de cortesia na OS. Sem financiamento pra essa OS, não faz nada.
 */
export async function reverseServiceFinancingInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  repairOrderId: string
): Promise<void> {
  const financing = await tx.creditoEficazServiceFinancing.findFirst({
    where: { tenantId, repairOrderId },
    select: { id: true },
  });
  if (!financing) return;

  const openUsages = await tx.creditoEficazUsage.findMany({
    where: { financingId: financing.id, status: "OPEN" },
    select: { id: true, customerId: true, amount: true, payments: { select: { amount: true } } },
  });

  for (const usage of openUsages) {
    const alreadyPaid = usage.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = round2(Number(usage.amount) - alreadyPaid);
    if (remaining > 0) {
      await tx.customer.update({
        where: { id: usage.customerId },
        data: { creditoEficazAvailableAmount: { increment: remaining } },
      });
    }
    await tx.creditoEficazUsage.update({ where: { id: usage.id }, data: { status: "CANCELLED" } });
  }
}

// ---------------------------------------------------------------------------
// Pagamento manual (Protótipo 1)
// ---------------------------------------------------------------------------

/** Suporta pagamento parcial: a obrigação só vira `PAID` quando a soma dos pagamentos atinge o valor. */
export async function registerManualPayment(
  tenantId: string,
  usageId: string,
  registeredById: string,
  amount: number,
  paidAt: Date,
  method: string
): Promise<SimpleResult> {
  if (amount <= 0) return { ok: false, error: "O valor precisa ser maior que zero." };

  return prisma.$transaction(async (tx) => {
    const usage = await tx.creditoEficazUsage.findFirst({
      where: { id: usageId, tenantId },
      select: { id: true, customerId: true, amount: true, status: true },
    });
    if (!usage) return { ok: false, error: "Obrigação não encontrada." };
    if (usage.status === "CANCELLED") {
      return { ok: false, error: "Esta obrigação foi cancelada (venda estornada)." };
    }

    const paidSoFar = await tx.creditoEficazPayment.aggregate({
      where: { usageId },
      _sum: { amount: true },
    });
    const alreadyPaid = Number(paidSoFar._sum.amount ?? 0);
    const remaining = round2(Number(usage.amount) - alreadyPaid);
    if (amount > remaining + 0.005) {
      return { ok: false, error: `Valor maior que o saldo em aberto (R$ ${remaining.toFixed(2)}).` };
    }

    await tx.creditoEficazPayment.create({
      data: { tenantId, usageId, amount, paidAt, method, registeredById },
    });

    const customer = await tx.customer.findFirst({
      where: { id: usage.customerId, tenantId },
      select: { creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
    });
    if (customer) {
      const limit = Number(customer.creditoEficazLimitAmount);
      const newAvailable = Math.min(limit, round2(Number(customer.creditoEficazAvailableAmount) + amount));
      await tx.customer.update({
        where: { id: usage.customerId },
        data: { creditoEficazAvailableAmount: newAvailable },
      });
    }

    const newAlreadyPaid = round2(alreadyPaid + amount);
    if (newAlreadyPaid >= Number(usage.amount) - 0.005) {
      await tx.creditoEficazUsage.update({ where: { id: usage.id }, data: { status: "PAID" } });
    }

    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Leitura — painel do cliente e do Admin
// ---------------------------------------------------------------------------

export type CustomerCreditSummary = {
  eficazNumber: string | null;
  limitAmount: number;
  availableAmount: number;
  usedAmount: number;
  blocked: boolean;
  blockedReason: string | null;
  openAmount: number;
  nextDueDate: Date | null;
};

/** Resumo pro painel do cliente (nunca inclui dado administrativo interno) e pro Admin. */
export async function getCustomerCreditSummary(
  tenantId: string,
  customerId: string
): Promise<CustomerCreditSummary | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: {
      eficazNumber: true,
      creditoEficazLimitAmount: true,
      creditoEficazAvailableAmount: true,
      creditoEficazBlocked: true,
      creditoEficazBlockedReason: true,
    },
  });
  if (!customer) return null;

  const openUsages = await prisma.creditoEficazUsage.findMany({
    where: { tenantId, customerId, status: "OPEN" },
    select: { amount: true, dueDate: true, payments: { select: { amount: true } } },
    orderBy: { dueDate: "asc" },
  });

  const openAmount = round2(
    openUsages.reduce(
      (sum, u) => sum + (Number(u.amount) - u.payments.reduce((s, p) => s + Number(p.amount), 0)),
      0
    )
  );

  const limitAmount = Number(customer.creditoEficazLimitAmount);
  const availableAmount = Number(customer.creditoEficazAvailableAmount);

  return {
    eficazNumber: customer.eficazNumber,
    limitAmount,
    availableAmount,
    usedAmount: round2(limitAmount - availableAmount),
    blocked: customer.creditoEficazBlocked,
    blockedReason: customer.creditoEficazBlockedReason,
    openAmount,
    nextDueDate: openUsages[0]?.dueDate ?? null,
  };
}

export type CreditoEficazExposureSummary = {
  totalLimit: number;
  totalUsed: number;
  totalAvailable: number;
  totalOpen: number;
  totalOverdue: number;
  pendingApplications: number;
};

/** Exposição financeira agregada do tenant — cards do painel Admin (seção "Crédito Eficaz"). */
export async function getExposureSummary(tenantId: string): Promise<CreditoEficazExposureSummary> {
  const [limitAgg, openUsages, pendingApplications] = await Promise.all([
    prisma.customer.aggregate({
      where: { tenantId },
      _sum: { creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
    }),
    prisma.creditoEficazUsage.findMany({
      where: { tenantId, status: "OPEN" },
      select: { amount: true, dueDate: true, payments: { select: { amount: true } } },
    }),
    prisma.creditoEficazApplication.count({
      where: { tenantId, status: { in: [...PENDING_DECISION_STATUSES] } },
    }),
  ]);

  const totalLimit = Number(limitAgg._sum.creditoEficazLimitAmount ?? 0);
  const totalAvailable = Number(limitAgg._sum.creditoEficazAvailableAmount ?? 0);

  const now = new Date();
  let totalOpen = 0;
  let totalOverdue = 0;
  for (const usage of openUsages) {
    const remaining = round2(
      Number(usage.amount) - usage.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    );
    totalOpen = round2(totalOpen + remaining);
    if (usage.dueDate < now) totalOverdue = round2(totalOverdue + remaining);
  }

  return {
    totalLimit,
    totalUsed: round2(totalLimit - totalAvailable),
    totalAvailable,
    totalOpen,
    totalOverdue,
    pendingApplications,
  };
}

export type PortfolioHealth = {
  approvedCustomers: number;
  /** Clientes com algo efetivamente usado (limite &gt; disponível) agora. */
  activeCustomers: number;
  totalLimit: number;
  totalUsed: number;
  totalAvailable: number;
  totalOpen: number;
  totalOverdue: number;
  totalUpcoming: number;
  totalReceived: number;
  /** `totalOverdue / totalUsed × 100` — 0 quando nada foi usado ainda. */
  overduePercent: number;
  averageTicket: number;
  /** Média da entrada nos financiamentos de OS que já tiveram entrada &gt; 0. */
  averageDownPayment: number;
  averageTermDays: number;
  paidOnTimeCount: number;
  paidLateCount: number;
  openCount: number;
  overdueCount: number;
};

/**
 * "Saúde do Crédito Eficaz" (Adendo) — pra olhar por poucos segundos e
 * entender o estado da carteira. Tudo derivado das tabelas existentes
 * (uso, pagamento, financiamento) — nenhum campo de "score" ou avaliação
 * subjetiva. Pontualidade é sempre baseada em fato observado: cada
 * pagamento comparado ao vencimento da parcela que ele quitou.
 */
export async function getPortfolioHealth(tenantId: string): Promise<PortfolioHealth> {
  const [customers, usages, financings, paymentsAgg] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, creditoEficazLimitAmount: { gt: 0 } },
      select: { creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
    }),
    prisma.creditoEficazUsage.findMany({
      where: { tenantId },
      select: {
        amount: true,
        status: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amount: true, paidAt: true } },
      },
    }),
    prisma.creditoEficazServiceFinancing.findMany({ where: { tenantId }, select: { downPayment: true } }),
    prisma.creditoEficazPayment.aggregate({ where: { tenantId }, _sum: { amount: true } }),
  ]);

  const totalLimit = round2(customers.reduce((sum, c) => sum + Number(c.creditoEficazLimitAmount), 0));
  const totalAvailable = round2(customers.reduce((sum, c) => sum + Number(c.creditoEficazAvailableAmount), 0));
  const totalUsed = round2(totalLimit - totalAvailable);
  const activeCustomers = customers.filter(
    (c) => Number(c.creditoEficazLimitAmount) > Number(c.creditoEficazAvailableAmount)
  ).length;

  const now = new Date();
  let totalOpen = 0;
  let totalOverdue = 0;
  let openCount = 0;
  let overdueCount = 0;
  let paidOnTimeCount = 0;
  let paidLateCount = 0;
  let termDaysSum = 0;

  for (const usage of usages) {
    const paidSum = usage.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = round2(Number(usage.amount) - paidSum);
    termDaysSum += Math.max(
      0,
      Math.round((usage.dueDate.getTime() - usage.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    );

    if (usage.status === "OPEN" && remaining > 0.005) {
      totalOpen = round2(totalOpen + remaining);
      openCount += 1;
      if (usage.dueDate < now) {
        totalOverdue = round2(totalOverdue + remaining);
        overdueCount += 1;
      }
    }

    for (const payment of usage.payments) {
      if (payment.paidAt <= usage.dueDate) paidOnTimeCount += 1;
      else paidLateCount += 1;
    }
  }

  const downPayments = financings.map((f) => Number(f.downPayment)).filter((v) => v > 0);

  return {
    approvedCustomers: customers.length,
    activeCustomers,
    totalLimit,
    totalUsed,
    totalAvailable,
    totalOpen,
    totalOverdue,
    totalUpcoming: round2(totalOpen - totalOverdue),
    totalReceived: round2(Number(paymentsAgg._sum.amount ?? 0)),
    overduePercent: totalUsed > 0 ? round2((totalOverdue / totalUsed) * 100) : 0,
    averageTicket: usages.length > 0 ? round2(usages.reduce((sum, u) => sum + Number(u.amount), 0) / usages.length) : 0,
    averageDownPayment:
      downPayments.length > 0 ? round2(downPayments.reduce((sum, v) => sum + v, 0) / downPayments.length) : 0,
    averageTermDays: usages.length > 0 ? Math.round(termDaysSum / usages.length) : 0,
    paidOnTimeCount,
    paidLateCount,
    openCount,
    overdueCount,
  };
}

export type CreditCohort = {
  monthStartISO: string;
  approvedCustomers: number;
  totalUsed: number;
  totalReceived: number;
  totalUpcoming: number;
  totalOverdue: number;
};

/**
 * Safra/coorte por mês de APROVAÇÃO (Adendo, item 14) — agrupa clientes
 * pelo mês em que a solicitação foi aprovada, soma o uso de todos eles.
 * Não existe precedente de `groupBy` por data no projeto — segue o mesmo
 * estilo de `commission-tier-service.ts` (mês a mês, agregado em JS).
 */
export async function getCreditCohorts(tenantId: string): Promise<CreditCohort[]> {
  const applications = await prisma.creditoEficazApplication.findMany({
    where: { tenantId, status: "APPROVED", reviewedAt: { not: null } },
    select: { customerId: true, reviewedAt: true },
  });
  if (applications.length === 0) return [];

  const customerIdsByMonth = new Map<string, Set<string>>();
  for (const application of applications) {
    const monthStartISO = startOfMonthISO(todayISO(application.reviewedAt!));
    const set = customerIdsByMonth.get(monthStartISO) ?? new Set<string>();
    set.add(application.customerId);
    customerIdsByMonth.set(monthStartISO, set);
  }

  const allCustomerIds = [...new Set(applications.map((a) => a.customerId))];
  const usages = await prisma.creditoEficazUsage.findMany({
    where: { tenantId, customerId: { in: allCustomerIds } },
    select: {
      customerId: true,
      amount: true,
      status: true,
      dueDate: true,
      payments: { select: { amount: true } },
    },
  });
  const usagesByCustomer = new Map<string, typeof usages>();
  for (const usage of usages) {
    const list = usagesByCustomer.get(usage.customerId);
    if (list) list.push(usage);
    else usagesByCustomer.set(usage.customerId, [usage]);
  }

  const now = new Date();
  const cohorts: CreditCohort[] = [];
  for (const [monthStartISO, customerIdSet] of [...customerIdsByMonth.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    let totalUsed = 0;
    let totalReceived = 0;
    let totalOpen = 0;
    let totalOverdue = 0;
    for (const customerId of customerIdSet) {
      for (const usage of usagesByCustomer.get(customerId) ?? []) {
        const paid = usage.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        totalUsed = round2(totalUsed + Number(usage.amount));
        totalReceived = round2(totalReceived + paid);
        if (usage.status === "OPEN") {
          const remaining = round2(Number(usage.amount) - paid);
          totalOpen = round2(totalOpen + remaining);
          if (usage.dueDate < now) totalOverdue = round2(totalOverdue + remaining);
        }
      }
    }
    cohorts.push({
      monthStartISO,
      approvedCustomers: customerIdSet.size,
      totalUsed,
      totalReceived,
      totalUpcoming: round2(totalOpen - totalOverdue),
      totalOverdue,
    });
  }
  return cohorts;
}

/** Histórico do cliente — cada lista já vem ordenada; a tela compõe a linha do tempo. */
export async function listCustomerLimitChanges(tenantId: string, customerId: string) {
  return prisma.creditoEficazLimitChange.findMany({
    where: { tenantId, customerId },
    include: { changedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCustomerUsages(tenantId: string, customerId: string) {
  return prisma.creditoEficazUsage.findMany({
    where: { tenantId, customerId },
    include: {
      payments: true,
      sale: { select: { number: true } },
      financing: { select: { repairOrder: { select: { number: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCustomerApplications(tenantId: string, customerId: string) {
  return prisma.creditoEficazApplication.findMany({
    where: { tenantId, customerId },
    include: { documents: { select: { id: true, type: true, uploadedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}
