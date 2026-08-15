import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { addDaysISO, periodRange, todayISO } from "@/lib/format";
import { parseConvenioRules } from "@/lib/validations/convenio";

/** Aceita a URL completa lida pelo leitor (`.../c/TOKEN`) ou o token puro digitado à mão. */
export function extractCredentialToken(rawInput: string): string {
  const trimmed = rawInput.trim();
  const match = trimmed.match(/\/c\/([^/?#]+)/);
  return (match ? match[1] : trimmed).trim();
}

const STATUS_MESSAGES: Record<string, string> = {
  PENDING: "Cadastro ainda pendente de aprovação.",
  SUSPENDED: "Colaborador suspenso do convênio.",
  BLOCKED: "Colaborador bloqueado.",
  CANCELLED: "Colaborador não pertence mais ao convênio.",
};

export type ConvenioCredential = {
  member: { id: string; name: string; selfieUrl: string };
  convenio: { id: string; name: string };
  benefitAmount: number;
};

export type ResolveConvenioCredentialResult =
  | ({ ok: true } & ConvenioCredential)
  | { ok: false; error: string };

/**
 * Quantos benefícios (não revertidos) o colaborador já usou no período atual
 * — corte por dia civil (fuso -03:00), nunca janela rolante de 24h (ver
 * decisão registrada no plano do módulo: "reseta sempre à meia-noite").
 * `periodDays: 1` = só hoje; `periodDays: 7` = hoje e os 6 dias anteriores.
 */
export async function countRedemptionsInCurrentPeriod(memberId: string, periodDays: number) {
  const periodStart = addDaysISO(todayISO(), -(periodDays - 1));
  const { start } = periodRange(periodStart, todayISO());
  return prisma.convenioRedemption.count({
    where: { memberId, reversedAt: null, createdAt: { gte: start } },
  });
}

async function validateMemberForRedemption(
  tenantId: string,
  member: {
    id: string;
    tenantId: string;
    convenioId: string;
    name: string;
    selfieUrl: string;
    status: string;
    validUntil: Date | null;
    convenio: { name: string; active: boolean; rules: unknown };
  } | null
): Promise<ResolveConvenioCredentialResult> {
  if (!member || member.tenantId !== tenantId) {
    return { ok: false, error: "QR Code de convênio não reconhecido." };
  }
  if (!member.convenio.active) {
    return { ok: false, error: "Este convênio não está mais disponível." };
  }
  if (member.status !== "ACTIVE") {
    return { ok: false, error: STATUS_MESSAGES[member.status] ?? "Benefício indisponível." };
  }
  if (member.validUntil && member.validUntil < new Date()) {
    return { ok: false, error: "Cadastro do colaborador expirado." };
  }

  const rules = parseConvenioRules(member.convenio.rules);
  const used = await countRedemptionsInCurrentPeriod(member.id, rules.periodDays);
  if (used >= rules.usesPerPeriod) {
    return { ok: false, error: "Limite de uso do benefício já foi atingido no período." };
  }

  return {
    ok: true,
    member: { id: member.id, name: member.name, selfieUrl: member.selfieUrl },
    convenio: { id: member.convenioId, name: member.convenio.name },
    benefitAmount: rules.benefitAmount,
  };
}

/**
 * Resolve e valida a credencial (QR Code) de um colaborador de convênio —
 * usada na checagem prévia no PDV, quando só se tem o token lido/digitado
 * (mostra o "confirme que é essa pessoa" pro vendedor).
 */
export async function resolveConvenioCredential(
  tenantId: string,
  rawInput: string
): Promise<ResolveConvenioCredentialResult> {
  const token = extractCredentialToken(rawInput);
  if (!token) return { ok: false, error: "Código do convênio vazio." };

  const member = await prisma.convenioMember.findUnique({
    where: { credentialTokenHash: hashToken(token) },
    include: { convenio: true },
  });
  return validateMemberForRedemption(tenantId, member);
}

/**
 * Revalida o colaborador pelo id, já resolvido antes no PDV — usada dentro
 * de `createSale`, no momento de fechar a venda de verdade. Nunca confia
 * que "já foi validado antes": o tempo entre escanear e pagar pode ter
 * mudado o status, e é aqui que a checagem vale de fato.
 */
export async function revalidateConvenioMember(
  tenantId: string,
  memberId: string
): Promise<ResolveConvenioCredentialResult> {
  const member = await prisma.convenioMember.findUnique({
    where: { id: memberId },
    include: { convenio: true },
  });
  return validateMemberForRedemption(tenantId, member);
}
