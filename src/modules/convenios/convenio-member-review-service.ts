import { prisma } from "@/lib/prisma";
import { inviteUrl } from "@/modules/convenios/invite-url";

/**
 * Revisão de cadastro de convênio feita no PDV (pedido do dono: qualquer
 * vendedor aprova quem se cadastrou pelo link, de qualquer convênio). Mais
 * restrita que `updateConvenioMemberStatusAction` (Admin/Gerente, qualquer
 * transição): aqui só existe PENDENTE → ATIVO ou PENDENTE → CANCELADO —
 * vendedor nunca suspende, bloqueia nem reativa quem já foi decidido.
 */

export type PendingConvenioMember = {
  id: string;
  name: string;
  /** CPF com o meio escondido — o vendedor confere a pessoa pela selfie, não precisa do número todo. */
  documentMasked: string;
  phone: string | null;
  selfieUrl: string;
  proofUrl: string | null;
  convenioId: string;
  convenioName: string;
  createdAt: Date;
};

export type ConvenioSignupLink = {
  convenioId: string;
  convenioName: string;
  /** `null` quando não há link ativo, ou é antigo demais pra ser reexibido. */
  url: string | null;
  createdAt: Date | null;
};

function maskDocument(document: string) {
  const digits = document.replace(/\D/g, "");
  if (digits.length !== 11) return "•••";
  return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
}

export async function listPendingConvenioMembers(tenantId: string): Promise<PendingConvenioMember[]> {
  const members = await prisma.convenioMember.findMany({
    where: { tenantId, status: "PENDING", convenio: { active: true } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      document: true,
      phone: true,
      selfieUrl: true,
      proofUrl: true,
      createdAt: true,
      convenio: { select: { id: true, name: true } },
    },
  });
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    documentMasked: maskDocument(member.document),
    phone: member.phone,
    selfieUrl: member.selfieUrl,
    proofUrl: member.proofUrl,
    convenioId: member.convenio.id,
    convenioName: member.convenio.name,
    createdAt: member.createdAt,
  }));
}

export async function countPendingConvenioMembers(tenantId: string): Promise<number> {
  return prisma.convenioMember.count({
    where: { tenantId, status: "PENDING", convenio: { active: true } },
  });
}

/**
 * Link de cadastro ATIVO de cada convênio ativo — o mais recente não
 * revogado, mesma regra de `/convenios/[id]`. Só leitura: gerar/revogar
 * continua com Admin/Gerente (gerar um novo derruba o que já está circulando).
 */
export async function listConvenioSignupLinks(tenantId: string): Promise<ConvenioSignupLink[]> {
  const convenios = await prisma.convenio.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      invites: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { token: true, createdAt: true, expiresAt: true },
      },
    },
  });
  return convenios.map((convenio) => {
    const invite = convenio.invites[0];
    const usable = invite?.token && (!invite.expiresAt || invite.expiresAt > new Date());
    return {
      convenioId: convenio.id,
      convenioName: convenio.name,
      url: usable ? inviteUrl(convenio.slug, invite.token!) : null,
      createdAt: invite?.createdAt ?? null,
    };
  });
}

export type ReviewDecision = "APPROVE" | "REJECT";
export type ReviewResult =
  | { ok: true; memberName: string; convenioId: string; convenioName: string }
  | { ok: false; error: string };

export async function reviewPendingConvenioMember(
  tenantId: string,
  memberId: string,
  reviewerId: string,
  decision: ReviewDecision,
  reason: string | null
): Promise<ReviewResult> {
  if (decision === "REJECT" && !reason?.trim()) {
    return { ok: false, error: "Informe o motivo da recusa." };
  }

  const member = await prisma.convenioMember.findFirst({
    where: { id: memberId, tenantId },
    select: { name: true, convenio: { select: { id: true, name: true } } },
  });
  if (!member) return { ok: false, error: "Cadastro não encontrado." };

  // `status: "PENDING"` no próprio WHERE: se outra pessoa já decidiu esse
  // cadastro (outro caixa, o Admin), nada é alterado — nunca sobrescreve
  // uma decisão já tomada.
  const updated = await prisma.convenioMember.updateMany({
    where: { id: memberId, tenantId, status: "PENDING" },
    data: {
      status: decision === "APPROVE" ? "ACTIVE" : "CANCELLED",
      statusReason: decision === "REJECT" ? reason!.trim() : null,
      statusChangedById: reviewerId,
      statusChangedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return { ok: false, error: "Esse cadastro já foi analisado por outra pessoa." };
  }

  return { ok: true, memberName: member.name, convenioId: member.convenio.id, convenioName: member.convenio.name };
}
