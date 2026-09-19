import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { changeCreditLimitInTx, round2 } from "./credito-eficaz-limit";

/**
 * Crédito Eficaz × Convênio — o SEGUNDO caminho de entrada para o MESMO
 * Crédito Eficaz que já existe. Nada aqui cria carteira nova, cliente novo
 * ou limite paralelo: tudo termina nos mesmos
 * `Customer.creditoEficazLimitAmount`/`...AvailableAmount`, nas mesmas
 * `CreditoEficazUsage` e no mesmo histórico `CreditoEficazLimitChange` do
 * fluxo normal. A única diferença é quem decide o limite: lá é o Admin,
 * aqui é a regra do convênio — e só quando o Admin ligou a chave.
 *
 * Toda escrita é idempotente por construção: a concessão inicial é
 * carimbada em `Customer.creditoEficazAutoGrantedAt` e o bônus de
 * pontualidade é único por parcela (`[sourceUsageId, reason]`). Ligar e
 * desligar a chave quantas vezes for nunca duplica nada.
 */

/** Valores sugeridos — só entram em vigor quando o Admin salva a configuração. */
export const CONVENIO_CREDIT_DEFAULTS = {
  defaultLimitAmount: 100,
  surchargePercent: 10,
  installmentCount: 2,
  installmentIntervalDays: 30,
  bonusEnabled: false,
  bonusPercent: 50,
  autoLimitCap: 300,
  blockOnOverdue: true,
  campaignEnabled: false,
  campaignDayOfMonth: 20,
};

export type ConvenioCreditPolicyValues = {
  enabled: boolean;
  defaultLimitAmount: number;
  surchargePercent: number;
  installmentCount: number;
  installmentIntervalDays: number;
  bonusEnabled: boolean;
  bonusPercent: number;
  autoLimitCap: number;
  blockOnOverdue: boolean;
  campaignEnabled: boolean;
  campaignDayOfMonth: number;
};

type PolicyRow = {
  enabled: boolean;
  defaultLimitAmount: Prisma.Decimal;
  surchargePercent: Prisma.Decimal;
  installmentCount: number;
  installmentIntervalDays: number;
  bonusEnabled: boolean;
  bonusPercent: Prisma.Decimal;
  autoLimitCap: Prisma.Decimal;
  blockOnOverdue: boolean;
  campaignEnabled: boolean;
  campaignDayOfMonth: number;
};

function toPolicyValues(policy: PolicyRow): ConvenioCreditPolicyValues {
  return {
    enabled: policy.enabled,
    defaultLimitAmount: Number(policy.defaultLimitAmount),
    surchargePercent: Number(policy.surchargePercent),
    installmentCount: policy.installmentCount,
    installmentIntervalDays: policy.installmentIntervalDays,
    bonusEnabled: policy.bonusEnabled,
    bonusPercent: Number(policy.bonusPercent),
    autoLimitCap: Number(policy.autoLimitCap),
    blockOnOverdue: policy.blockOnOverdue,
    campaignEnabled: policy.campaignEnabled,
    campaignDayOfMonth: policy.campaignDayOfMonth,
  };
}

const POLICY_SELECT = {
  enabled: true,
  defaultLimitAmount: true,
  surchargePercent: true,
  installmentCount: true,
  installmentIntervalDays: true,
  bonusEnabled: true,
  bonusPercent: true,
  autoLimitCap: true,
  blockOnOverdue: true,
  campaignEnabled: true,
  campaignDayOfMonth: true,
} as const;

// ---------------------------------------------------------------------------
// Configuração (a chave mestre e seus parâmetros)
// ---------------------------------------------------------------------------

export type ConvenioCreditPanel = {
  convenioId: string;
  convenioName: string;
  /** `false` quando o Admin ainda nem abriu a configuração — vale o desligado. */
  configured: boolean;
  policy: ConvenioCreditPolicyValues;
  enabledAt: Date | null;
  /** Colaboradores ACTIVE do convênio. */
  activeMembers: number;
  /** Desses, os que já podem receber limite (têm cadastro de cliente ligado). */
  eligibleMembers: number;
  /**
   * Aprovados no convênio mas SEM cadastro de cliente (o cadastro manual do
   * Admin não cria login) — o crédito automático os ignora de propósito;
   * ficam listados pra decisão caso a caso, nunca são criados sozinhos.
   */
  membersWithoutCustomer: number;
  /** Clientes que já receberam limite por este convênio. */
  creditCustomers: number;
};

/** Painel por convênio ativo — a base da seção "Crédito automático" do Admin. */
export async function listConvenioCreditPanels(tenantId: string): Promise<ConvenioCreditPanel[]> {
  const convenios = await prisma.convenio.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      creditPolicy: { select: { ...POLICY_SELECT, enabledAt: true } },
      members: {
        where: { status: "ACTIVE" },
        select: { id: true, customer: { select: { id: true } } },
      },
      _count: { select: { creditCustomers: true } },
    },
  });

  return convenios.map((convenio) => {
    const policy = convenio.creditPolicy;
    const eligible = convenio.members.filter((member) => member.customer != null).length;
    return {
      convenioId: convenio.id,
      convenioName: convenio.name,
      configured: policy != null,
      policy: policy ? toPolicyValues(policy) : { ...CONVENIO_CREDIT_DEFAULTS, enabled: false },
      enabledAt: policy?.enabledAt ?? null,
      activeMembers: convenio.members.length,
      eligibleMembers: eligible,
      membersWithoutCustomer: convenio.members.length - eligible,
      creditCustomers: convenio._count.creditCustomers,
    };
  });
}

/** Colaboradores aprovados sem cadastro de cliente — a lista que o painel mostra. */
export async function listMembersWithoutCustomer(tenantId: string, convenioId: string) {
  return prisma.convenioMember.findMany({
    where: { tenantId, convenioId, status: "ACTIVE", customer: { is: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, createdAt: true },
  });
}

export type UpdateConvenioCreditPolicyInput = Partial<ConvenioCreditPolicyValues>;

export type UpdatePolicyResult =
  | { ok: true; granted: number; skipped: number }
  | { ok: false; error: string };

/**
 * Salva a configuração do convênio. Quando (e só quando) a chave passa de
 * OFFLINE para ONLINE, aplica a concessão inicial a quem já está aprovado —
 * na mesma chamada, pra o Admin ver na hora quantos receberam. Desligar
 * nunca retira nada de ninguém: só impede novas concessões.
 */
export async function updateConvenioCreditPolicy(
  tenantId: string,
  convenioId: string,
  userId: string,
  input: UpdateConvenioCreditPolicyInput
): Promise<UpdatePolicyResult> {
  const convenio = await prisma.convenio.findFirst({
    where: { id: convenioId, tenantId },
    select: { id: true, creditPolicy: { select: { enabled: true } } },
  });
  if (!convenio) return { ok: false, error: "Convênio não encontrado." };

  const validation = validatePolicyInput(input);
  if (validation) return { ok: false, error: validation };

  const wasEnabled = convenio.creditPolicy?.enabled ?? false;
  const willEnable = input.enabled ?? wasEnabled;

  await prisma.convenioCreditPolicy.upsert({
    where: { convenioId },
    create: {
      tenantId,
      convenioId,
      ...CONVENIO_CREDIT_DEFAULTS,
      ...input,
      enabled: willEnable,
      enabledAt: willEnable ? new Date() : null,
      updatedById: userId,
    },
    update: {
      ...input,
      // Carimbo só na virada pra ONLINE — mantém a data da primeira
      // ativação quando a chave já estava ligada e o Admin só mexeu nos
      // parâmetros.
      ...(willEnable && !wasEnabled ? { enabledAt: new Date() } : {}),
      updatedById: userId,
    },
  });

  if (willEnable) {
    const applied = await applyPolicyToApprovedMembers(tenantId, convenioId, userId);
    return { ok: true, granted: applied.granted, skipped: applied.skipped };
  }
  return { ok: true, granted: 0, skipped: 0 };
}

function validatePolicyInput(input: UpdateConvenioCreditPolicyInput): string | null {
  if (input.defaultLimitAmount != null && (input.defaultLimitAmount < 0 || input.defaultLimitAmount > 100000)) {
    return "O limite inicial precisa ficar entre R$ 0 e R$ 100.000.";
  }
  if (input.surchargePercent != null && (input.surchargePercent < 0 || input.surchargePercent > 100)) {
    return "Informe um acréscimo entre 0% e 100%.";
  }
  if (
    input.installmentCount != null &&
    (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > 12)
  ) {
    return "Informe de 1 a 12 parcelas.";
  }
  if (
    input.installmentIntervalDays != null &&
    (!Number.isInteger(input.installmentIntervalDays) ||
      input.installmentIntervalDays < 1 ||
      input.installmentIntervalDays > 180)
  ) {
    return "O intervalo entre parcelas precisa ficar entre 1 e 180 dias.";
  }
  if (input.bonusPercent != null && (input.bonusPercent < 0 || input.bonusPercent > 100)) {
    return "O bônus por pontualidade precisa ficar entre 0% e 100%.";
  }
  if (input.autoLimitCap != null && (input.autoLimitCap < 0 || input.autoLimitCap > 100000)) {
    return "O teto do crescimento automático precisa ficar entre R$ 0 e R$ 100.000.";
  }
  if (
    input.campaignDayOfMonth != null &&
    (!Number.isInteger(input.campaignDayOfMonth) || input.campaignDayOfMonth < 1 || input.campaignDayOfMonth > 28)
  ) {
    return "Escolha um dia entre 1 e 28 (evita problema em mês curto).";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Concessão automática
// ---------------------------------------------------------------------------

export type ApplyPolicyResult = { granted: number; skipped: number };

/**
 * Concede o limite inicial a todo colaborador ACTIVE do convênio que ainda
 * não recebeu. Pula, sem nunca tocar em nada:
 *  - quem não tem cadastro de cliente (não há onde registrar limite);
 *  - quem já foi carimbado antes (idempotência do liga/desliga);
 *  - quem já tem limite do fluxo normal — decisão humana nunca é
 *    sobrescrita por regra automática.
 * Cada cliente é uma transação própria: um erro isolado não derruba o lote.
 */
export async function applyPolicyToApprovedMembers(
  tenantId: string,
  convenioId: string,
  userId: string
): Promise<ApplyPolicyResult> {
  const policy = await prisma.convenioCreditPolicy.findFirst({
    where: { convenioId, tenantId },
    select: POLICY_SELECT,
  });
  if (!policy?.enabled) return { granted: 0, skipped: 0 };

  const members = await prisma.convenioMember.findMany({
    where: { tenantId, convenioId, status: "ACTIVE", customer: { isNot: null } },
    select: { customer: { select: { id: true } } },
  });

  let granted = 0;
  let skipped = 0;
  for (const member of members) {
    const customerId = member.customer?.id;
    if (!customerId) continue;
    const result = await grantInitialCredit(
      tenantId,
      convenioId,
      customerId,
      userId,
      Number(policy.defaultLimitAmount)
    );
    if (result === "granted") granted += 1;
    else skipped += 1;
  }
  return { granted, skipped };
}

type GrantOutcome = "granted" | "skipped";

/**
 * Concessão inicial de UM cliente — transacional e idempotente. O
 * `creditoEficazAutoGrantedAt: null` dentro do próprio `WHERE` do UPDATE é
 * o que garante que duas execuções simultâneas nunca concedam duas vezes
 * (mesmo princípio do débito atômico em `debitCreditoEficazInTx`).
 */
async function grantInitialCredit(
  tenantId: string,
  convenioId: string,
  customerId: string,
  userId: string,
  limitAmount: number
): Promise<GrantOutcome> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.customer.updateMany({
      where: {
        id: customerId,
        tenantId,
        creditoEficazAutoGrantedAt: null,
        // Quem já tem limite (do fluxo normal ou de qualquer outra origem)
        // nunca é tocado: o crédito automático só entra onde não há nada.
        creditoEficazLimitAmount: 0,
      },
      data: { creditoEficazAutoGrantedAt: new Date() },
    });
    if (claimed.count === 0) return "skipped";

    const result = await changeCreditLimitInTx(tx, tenantId, customerId, limitAmount, userId, {
      reason: "CONVENIO_AUTO_GRANT",
      note: "Limite automático concedido — Convênio",
      source: { type: "CONVENIO", convenioId },
    });
    if (!result.ok) throw new Error(result.error);
    return "granted";
  });
}

/**
 * Chamado quando um colaborador é aprovado (PDV ou Admin) — é o que faz a
 * regra valer também pros aprovados DEPOIS de a chave já estar ligada.
 * Nunca lança: a aprovação do convênio não pode falhar por causa do crédito.
 */
export async function grantConvenioCreditOnApproval(
  tenantId: string,
  convenioId: string,
  memberId: string,
  userId: string
): Promise<GrantOutcome> {
  try {
    const policy = await prisma.convenioCreditPolicy.findFirst({
      where: { convenioId, tenantId, enabled: true },
      select: { defaultLimitAmount: true },
    });
    if (!policy) return "skipped";

    const customer = await prisma.customer.findFirst({
      where: { tenantId, convenioMemberId: memberId },
      select: { id: true },
    });
    if (!customer) return "skipped";

    return await grantInitialCredit(
      tenantId,
      convenioId,
      customer.id,
      userId,
      Number(policy.defaultLimitAmount)
    );
  } catch {
    return "skipped";
  }
}

// ---------------------------------------------------------------------------
// Condições de uso do cliente (acréscimo, parcelas, inadimplência)
// ---------------------------------------------------------------------------

export type CustomerCreditTerms = {
  source: "MANUAL" | "CONVENIO";
  convenioId: string | null;
  convenioName: string | null;
  surchargePercent: number;
  installmentCount: number;
  installmentIntervalDays: number;
  /**
   * `true` quando existe parcela vencida em aberto E o convênio pede
   * bloqueio nesse caso. Não é o bloqueio manual (`creditoEficazBlocked`):
   * nada é apagado nem marcado no cliente, só impede nova utilização até
   * regularizar.
   */
  overdueBlocked: boolean;
  overdueAmount: number;
};

/**
 * Condições valendo pra ESTE cliente agora. Cliente do fluxo normal
 * continua exatamente como sempre foi: acréscimo do tenant e uma parcela
 * só. Só quem tem limite de origem convênio (com a chave ligada) recebe as
 * condições do convênio.
 */
export async function resolveCustomerCreditTerms(
  tenantId: string,
  customerId: string
): Promise<CustomerCreditTerms> {
  const [customer, tenant] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        creditoEficazSource: true,
        creditoEficazSourceConvenioId: true,
        creditoEficazSourceConvenio: {
          select: { id: true, name: true, active: true, creditPolicy: { select: POLICY_SELECT } },
        },
      },
    }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { creditoEficazSurchargePercent: true },
    }),
  ]);

  const fallback: CustomerCreditTerms = {
    source: "MANUAL",
    convenioId: null,
    convenioName: null,
    surchargePercent: Number(tenant.creditoEficazSurchargePercent),
    installmentCount: 1,
    installmentIntervalDays: 30,
    overdueBlocked: false,
    overdueAmount: 0,
  };
  if (!customer) return fallback;

  const convenio = customer.creditoEficazSourceConvenio;
  const policy = convenio?.creditPolicy;
  if (customer.creditoEficazSource !== "CONVENIO" || !convenio?.active || !policy?.enabled) {
    return fallback;
  }

  const values = toPolicyValues(policy);
  const overdue = values.blockOnOverdue ? await getOverdueAmount(tenantId, customerId) : 0;
  return {
    source: "CONVENIO",
    convenioId: convenio.id,
    convenioName: convenio.name,
    surchargePercent: values.surchargePercent,
    installmentCount: values.installmentCount,
    installmentIntervalDays: values.installmentIntervalDays,
    overdueBlocked: overdue > 0,
    overdueAmount: overdue,
  };
}

/** Soma em aberto das parcelas já vencidas — "vencida" continua sendo OPEN + `dueDate` no passado. */
export async function getOverdueAmount(tenantId: string, customerId: string): Promise<number> {
  const usages = await prisma.creditoEficazUsage.findMany({
    where: { tenantId, customerId, status: "OPEN", dueDate: { lt: new Date() } },
    select: { amount: true, payments: { select: { amount: true } } },
  });
  return sumRemaining(usages);
}

/** Mesma conta, dentro da transação de quem chama (usada no guard do débito). */
export async function getOverdueAmountInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerId: string
): Promise<number> {
  const usages = await tx.creditoEficazUsage.findMany({
    where: { tenantId, customerId, status: "OPEN", dueDate: { lt: new Date() } },
    select: { amount: true, payments: { select: { amount: true } } },
  });
  return sumRemaining(usages);
}

function sumRemaining(
  usages: { amount: Prisma.Decimal; payments: { amount: Prisma.Decimal }[] }[]
): number {
  return round2(
    usages.reduce(
      (total, usage) =>
        total + (Number(usage.amount) - usage.payments.reduce((paid, p) => paid + Number(p.amount), 0)),
      0
    )
  );
}

/**
 * Guard de inadimplência, chamado de dentro de `debitCreditoEficazInTx`.
 * Devolve a mensagem de recusa ou `null` quando pode seguir. Só vale pra
 * cliente de convênio com a regra ligada — o fluxo normal não muda.
 */
export async function checkOverdueBlockInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerId: string
): Promise<string | null> {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, tenantId },
    select: {
      creditoEficazSource: true,
      creditoEficazSourceConvenio: {
        select: { active: true, creditPolicy: { select: { enabled: true, blockOnOverdue: true } } },
      },
    },
  });
  if (!customer || customer.creditoEficazSource !== "CONVENIO") return null;

  const policy = customer.creditoEficazSourceConvenio?.creditPolicy;
  if (!customer.creditoEficazSourceConvenio?.active || !policy?.enabled || !policy.blockOnOverdue) {
    return null;
  }

  const overdue = await getOverdueAmountInTx(tx, tenantId, customerId);
  if (overdue <= 0) return null;
  return `Existe parcela vencida em aberto (R$ ${overdue.toFixed(2)}). Regularize para voltar a usar o Crédito Eficaz.`;
}

// ---------------------------------------------------------------------------
// Bônus por pontualidade
// ---------------------------------------------------------------------------

export type PunctualityBonusResult = { applied: false } | { applied: true; amount: number; newLimit: number };

/**
 * Aumento permanente de limite por parcela paga EM DIA, aplicado logo
 * depois de a parcela virar PAID (dentro da mesma transação do pagamento).
 *
 * Regras, nesta ordem:
 *  - cliente precisa ser de convênio com a chave do bônus ligada;
 *  - a parcela precisa estar quitada e NENHUM pagamento dela pode ter sido
 *    feito depois do vencimento (atraso recompõe limite normalmente, mas
 *    nunca gera bônus);
 *  - o bônus é `bonusPercent`% do valor da parcela, cortado pelo teto do
 *    crescimento automático — nunca ultrapassa, e quando o limite já está
 *    no teto simplesmente não há bônus (o Admin segue podendo conceder
 *    acima disso manualmente; o teto só para o automático).
 * A trava contra bônus repetido é o índice único `[sourceUsageId, reason]`.
 */
export async function applyPunctualityBonusInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  usageId: string,
  changedById: string
): Promise<PunctualityBonusResult> {
  const usage = await tx.creditoEficazUsage.findFirst({
    where: { id: usageId, tenantId },
    select: {
      customerId: true,
      amount: true,
      dueDate: true,
      status: true,
      installmentNumber: true,
      installmentCount: true,
      payments: { select: { paidAt: true } },
    },
  });
  if (!usage || usage.status !== "PAID") return { applied: false };

  // Pontualidade de verdade: a parcela inteira precisa ter sido paga até o
  // vencimento, não só o último pagamento parcial.
  const paidOnTime = usage.payments.every((payment) => payment.paidAt <= usage.dueDate);
  if (!paidOnTime) return { applied: false };

  const customer = await tx.customer.findFirst({
    where: { id: usage.customerId, tenantId },
    select: {
      creditoEficazSource: true,
      creditoEficazLimitAmount: true,
      creditoEficazSourceConvenio: {
        select: {
          active: true,
          creditPolicy: {
            select: { enabled: true, bonusEnabled: true, bonusPercent: true, autoLimitCap: true },
          },
        },
      },
    },
  });
  if (!customer || customer.creditoEficazSource !== "CONVENIO") return { applied: false };

  const policy = customer.creditoEficazSourceConvenio?.creditPolicy;
  if (!customer.creditoEficazSourceConvenio?.active || !policy?.enabled || !policy.bonusEnabled) {
    return { applied: false };
  }

  const alreadyBonused = await tx.creditoEficazLimitChange.findFirst({
    where: { sourceUsageId: usageId, reason: "PUNCTUALITY_BONUS" },
    select: { id: true },
  });
  if (alreadyBonused) return { applied: false };

  const currentLimit = Number(customer.creditoEficazLimitAmount);
  const cap = Number(policy.autoLimitCap);
  if (currentLimit >= cap - 0.005) return { applied: false };

  const rawBonus = round2((Number(usage.amount) * Number(policy.bonusPercent)) / 100);
  const bonus = round2(Math.min(rawBonus, cap - currentLimit));
  if (bonus <= 0) return { applied: false };

  const newLimit = round2(currentLimit + bonus);
  const label =
    usage.installmentNumber && usage.installmentCount && usage.installmentCount > 1
      ? ` (parcela ${usage.installmentNumber}/${usage.installmentCount})`
      : "";
  const result = await changeCreditLimitInTx(tx, tenantId, usage.customerId, newLimit, changedById, {
    reason: "PUNCTUALITY_BONUS",
    sourceUsageId: usageId,
    note: `Bônus por pagamento pontual${label}`,
  });
  if (!result.ok) return { applied: false };
  return { applied: true, amount: bonus, newLimit };
}

// ---------------------------------------------------------------------------
// Alteração de limite em massa
// ---------------------------------------------------------------------------

export type BulkLimitTarget =
  | { kind: "CONVENIO"; convenioId: string }
  | { kind: "CUSTOMERS"; customerIds: string[] };

export type BulkLimitPreview = {
  affected: number;
  newLimit: number;
  /** Soma dos limites de hoje — a exposição máxima potencial atual. */
  currentTotalLimit: number;
  /** Soma dos limites depois da alteração. */
  nextTotalLimit: number;
  currentAverageLimit: number;
  /** Já utilizado (limite − disponível) do grupo, que a alteração nunca toca. */
  currentUsed: number;
  /** Quantos ficariam com limite abaixo do que já usaram (novas compras travadas até quitar). */
  belowUsedCount: number;
  /** Dívida em aberto do grupo — não muda com a alteração, aparece só pro Admin ver. */
  openAmount: number;
};

async function loadBulkTargets(tenantId: string, target: BulkLimitTarget) {
  const where: Prisma.CustomerWhereInput =
    target.kind === "CONVENIO"
      ? { tenantId, creditoEficazSource: "CONVENIO", creditoEficazSourceConvenioId: target.convenioId }
      : { tenantId, id: { in: target.customerIds } };
  return prisma.customer.findMany({
    where,
    select: { id: true, creditoEficazLimitAmount: true, creditoEficazAvailableAmount: true },
    orderBy: { name: "asc" },
  });
}

/**
 * O que o Admin VÊ antes de confirmar: quantos clientes, limite atual,
 * limite novo, exposição total antes e depois. Nunca escreve nada.
 */
export async function previewBulkLimitChange(
  tenantId: string,
  target: BulkLimitTarget,
  newLimit: number
): Promise<BulkLimitPreview> {
  const customers = await loadBulkTargets(tenantId, target);
  const currentTotalLimit = round2(
    customers.reduce((sum, c) => sum + Number(c.creditoEficazLimitAmount), 0)
  );
  const currentUsed = round2(
    customers.reduce(
      (sum, c) => sum + (Number(c.creditoEficazLimitAmount) - Number(c.creditoEficazAvailableAmount)),
      0
    )
  );
  const belowUsedCount = customers.filter(
    (c) =>
      newLimit <
      round2(Number(c.creditoEficazLimitAmount) - Number(c.creditoEficazAvailableAmount)) - 0.005
  ).length;

  const openUsages = customers.length
    ? await prisma.creditoEficazUsage.findMany({
        where: { tenantId, customerId: { in: customers.map((c) => c.id) }, status: "OPEN" },
        select: { amount: true, payments: { select: { amount: true } } },
      })
    : [];

  return {
    affected: customers.length,
    newLimit,
    currentTotalLimit,
    nextTotalLimit: round2(newLimit * customers.length),
    currentAverageLimit: customers.length ? round2(currentTotalLimit / customers.length) : 0,
    currentUsed,
    belowUsedCount,
    openAmount: sumRemaining(openUsages),
  };
}

export type BulkLimitResult = { ok: true; changed: number } | { ok: false; error: string };

/**
 * Aplica o novo limite ao grupo. Reduzir abaixo do já utilizado é
 * permitido AQUI de propósito (`allowBelowUsed`): a regra combinada é que
 * reduzir limite nunca apaga, reduz ou modifica dívida — só zera o
 * disponível e trava novas compras até sobrar limite de novo. Cada cliente
 * é uma transação, e todos ganham linha no histórico com motivo
 * `BULK_ADJUSTMENT`.
 */
export async function applyBulkLimitChange(
  tenantId: string,
  userId: string,
  target: BulkLimitTarget,
  newLimit: number,
  note?: string | null
): Promise<BulkLimitResult> {
  if (!Number.isFinite(newLimit) || newLimit < 0) {
    return { ok: false, error: "O limite não pode ser negativo." };
  }
  if (newLimit > 100000) return { ok: false, error: "Limite acima do teto permitido (R$ 100.000)." };

  const customers = await loadBulkTargets(tenantId, target);
  if (customers.length === 0) return { ok: false, error: "Nenhum cliente selecionado." };

  let changed = 0;
  for (const customer of customers) {
    if (Math.abs(Number(customer.creditoEficazLimitAmount) - newLimit) < 0.005) continue;
    const result = await prisma.$transaction((tx) =>
      changeCreditLimitInTx(tx, tenantId, customer.id, newLimit, userId, {
        reason: "BULK_ADJUSTMENT",
        note: note?.trim() || "Alteração em massa realizada pelo administrador",
        allowBelowUsed: true,
      })
    );
    if (result.ok) changed += 1;
  }
  return { ok: true, changed };
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export type ConvenioExposure = {
  convenioId: string;
  convenioName: string;
  customers: number;
  totalLimit: number;
  averageLimit: number;
  totalUsed: number;
  totalAvailable: number;
  totalOpen: number;
  totalOverdue: number;
  blockedCustomers: number;
  overdueCustomers: number;
  /** Soma dos bônus de pontualidade já concedidos (aumento de limite). */
  totalBonus: number;
  totalReceived: number;
};

/**
 * "Exposição Convênio" — o indicador que permite acompanhar o crescimento
 * antes de aumentar limites. `totalLimit` é a exposição máxima potencial
 * (100 clientes × R$ 100 = R$ 10.000); `totalOpen` é a dívida real de hoje.
 */
export async function getConvenioExposure(tenantId: string): Promise<ConvenioExposure[]> {
  const convenios = await prisma.convenio.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (convenios.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { tenantId, creditoEficazSource: "CONVENIO", creditoEficazSourceConvenioId: { not: null } },
    select: {
      id: true,
      creditoEficazSourceConvenioId: true,
      creditoEficazLimitAmount: true,
      creditoEficazAvailableAmount: true,
      creditoEficazBlocked: true,
    },
  });
  const customerIds = customers.map((c) => c.id);

  const [usages, bonuses] = await Promise.all([
    customerIds.length
      ? prisma.creditoEficazUsage.findMany({
          where: { tenantId, customerId: { in: customerIds }, status: { not: "CANCELLED" } },
          select: {
            customerId: true,
            amount: true,
            dueDate: true,
            status: true,
            payments: { select: { amount: true } },
          },
        })
      : [],
    customerIds.length
      ? prisma.creditoEficazLimitChange.findMany({
          where: { tenantId, customerId: { in: customerIds }, reason: "PUNCTUALITY_BONUS" },
          select: { customerId: true, previousLimit: true, newLimit: true },
        })
      : [],
  ]);

  const now = new Date();
  return convenios
    .map((convenio) => {
      const mine = customers.filter((c) => c.creditoEficazSourceConvenioId === convenio.id);
      const mineIds = new Set(mine.map((c) => c.id));
      const totalLimit = round2(mine.reduce((sum, c) => sum + Number(c.creditoEficazLimitAmount), 0));
      const totalAvailable = round2(
        mine.reduce((sum, c) => sum + Number(c.creditoEficazAvailableAmount), 0)
      );

      let totalOpen = 0;
      let totalOverdue = 0;
      let totalReceived = 0;
      const overdueCustomers = new Set<string>();
      for (const usage of usages) {
        if (!mineIds.has(usage.customerId)) continue;
        const paid = usage.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        totalReceived = round2(totalReceived + paid);
        if (usage.status !== "OPEN") continue;
        const remaining = round2(Number(usage.amount) - paid);
        totalOpen = round2(totalOpen + remaining);
        if (usage.dueDate < now && remaining > 0) {
          totalOverdue = round2(totalOverdue + remaining);
          overdueCustomers.add(usage.customerId);
        }
      }

      const totalBonus = round2(
        bonuses
          .filter((b) => mineIds.has(b.customerId))
          .reduce((sum, b) => sum + (Number(b.newLimit) - Number(b.previousLimit)), 0)
      );

      return {
        convenioId: convenio.id,
        convenioName: convenio.name,
        customers: mine.length,
        totalLimit,
        averageLimit: mine.length ? round2(totalLimit / mine.length) : 0,
        totalUsed: round2(totalLimit - totalAvailable),
        totalAvailable,
        totalOpen,
        totalOverdue,
        blockedCustomers: mine.filter((c) => c.creditoEficazBlocked).length,
        overdueCustomers: overdueCustomers.size,
        totalBonus,
        totalReceived,
      };
    })
    .filter((exposure) => exposure.customers > 0);
}

// ---------------------------------------------------------------------------
// Campanha mensal de pontualidade — ESTRUTURA PREPARADA E DESLIGADA
// ---------------------------------------------------------------------------

/**
 * Por envolver promoção/sorteio, aqui existe só a APURAÇÃO de quem seria
 * elegível. Nada é executado sozinho: não há job agendado, não há sorteio,
 * não há prêmio, e `registerCampaignEntries` recusa enquanto
 * `campaignEnabled` estiver desligado (o padrão). Só depois da validação
 * administrativa/jurídica das regras é que isso deve ser ligado.
 *
 * Critério: crédito ativo, alguma parcela vencendo DENTRO do mês de
 * referência e nenhuma delas paga com atraso (nem em aberto vencida). Uma
 * participação por cliente, sempre — nunca proporcional a dívida, valor
 * comprado, número de parcelas ou limite disponível.
 */
export type CampaignEligible = { customerId: string; customerName: string; installments: number };

export async function previewCampaignEligibility(
  tenantId: string,
  convenioId: string | null,
  referenceMonth: string
): Promise<CampaignEligible[]> {
  const match = /^(\d{4})-(\d{2})$/.exec(referenceMonth);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0);

  const usages = await prisma.creditoEficazUsage.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      dueDate: { gte: start, lt: end },
      customer: {
        creditoEficazLimitAmount: { gt: 0 },
        creditoEficazBlocked: false,
        ...(convenioId
          ? { creditoEficazSource: "CONVENIO" as const, creditoEficazSourceConvenioId: convenioId }
          : {}),
      },
    },
    select: {
      customerId: true,
      status: true,
      dueDate: true,
      customer: { select: { name: true } },
      payments: { select: { paidAt: true } },
    },
  });

  const byCustomer = new Map<string, { name: string; installments: number; punctual: boolean }>();
  for (const usage of usages) {
    const entry = byCustomer.get(usage.customerId) ?? {
      name: usage.customer.name,
      installments: 0,
      punctual: true,
    };
    entry.installments += 1;
    const late = usage.status !== "PAID" || usage.payments.some((payment) => payment.paidAt > usage.dueDate);
    if (late) entry.punctual = false;
    byCustomer.set(usage.customerId, entry);
  }

  return [...byCustomer.entries()]
    .filter(([, entry]) => entry.punctual && entry.installments > 0)
    .map(([customerId, entry]) => ({
      customerId,
      customerName: entry.name,
      installments: entry.installments,
    }));
}

export type RegisterCampaignResult =
  | { ok: true; campaignId: string; entries: number }
  | { ok: false; error: string };

/** Só roda por ação explícita do Admin e com a campanha habilitada no convênio. */
export async function registerCampaignEntries(
  tenantId: string,
  convenioId: string,
  referenceMonth: string
): Promise<RegisterCampaignResult> {
  const policy = await prisma.convenioCreditPolicy.findFirst({
    where: { convenioId, tenantId },
    select: { campaignEnabled: true },
  });
  if (!policy?.campaignEnabled) {
    return { ok: false, error: "A campanha de pontualidade está desligada para este convênio." };
  }

  const eligible = await previewCampaignEligibility(tenantId, convenioId, referenceMonth);
  const campaign = await prisma.creditoEficazCampaign.upsert({
    where: { tenantId_convenioId_referenceMonth: { tenantId, convenioId, referenceMonth } },
    create: { tenantId, convenioId, referenceMonth },
    update: {},
    select: { id: true },
  });

  // `skipDuplicates` + índice único `[campaignId, customerId]`: reapurar o
  // mesmo mês nunca dá duas participações ao mesmo cliente.
  const created = await prisma.creditoEficazCampaignEntry.createMany({
    data: eligible.map((entry) => ({ tenantId, campaignId: campaign.id, customerId: entry.customerId })),
    skipDuplicates: true,
  });
  return { ok: true, campaignId: campaign.id, entries: created.count };
}
