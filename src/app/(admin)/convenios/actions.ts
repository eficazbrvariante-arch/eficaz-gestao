"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageConvenios } from "@/lib/permissions";
import { generateResetToken } from "@/lib/tokens";
import {
  convenioMemberSchema,
  convenioSchema,
  updateConvenioMemberStatusSchema,
  type ConvenioInput,
  type ConvenioMemberInput,
  type UpdateConvenioMemberStatusInput,
} from "@/lib/validations/convenio";

async function requireConvenioManager(): Promise<
  { error: string } | { user: Awaited<ReturnType<typeof requireUser>> }
> {
  const user = await requireUser();
  if (!canManageConvenios(user.role)) {
    return { error: "Você não tem permissão para gerenciar convênios." };
  }
  return { user };
}

function toRules(data: ConvenioInput) {
  return {
    benefitAmount: data.benefitAmount,
    requireProof: data.requireProof,
    usesPerPeriod: data.usesPerPeriod,
    periodDays: data.periodDays,
  };
}

export async function createConvenioAction(input: ConvenioInput) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  const parsed = convenioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const existing = await prisma.convenio.findFirst({
    where: { tenantId: user.tenantId, slug: parsed.data.slug },
  });
  if (existing) return { error: "Já existe um convênio com esse identificador." };

  await prisma.convenio.create({
    data: {
      tenantId: user.tenantId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      logoUrl: parsed.data.logoUrl || null,
      responsibleName: parsed.data.responsibleName || null,
      responsiblePhone: parsed.data.responsiblePhone || null,
      active: parsed.data.active,
      rules: toRules(parsed.data),
    },
  });

  revalidatePath("/convenios");
  redirect("/convenios");
}

export async function updateConvenioAction(id: string, input: ConvenioInput) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  const parsed = convenioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const duplicate = await prisma.convenio.findFirst({
    where: { tenantId: user.tenantId, slug: parsed.data.slug, NOT: { id } },
  });
  if (duplicate) return { error: "Já existe um convênio com esse identificador." };

  const result = await prisma.convenio.updateMany({
    where: { id, tenantId: user.tenantId },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      logoUrl: parsed.data.logoUrl || null,
      responsibleName: parsed.data.responsibleName || null,
      responsiblePhone: parsed.data.responsiblePhone || null,
      active: parsed.data.active,
      rules: toRules(parsed.data),
    },
  });
  if (result.count === 0) return { error: "Convênio não encontrado." };

  revalidatePath("/convenios");
  revalidatePath(`/convenios/${id}`);
  redirect("/convenios");
}

/**
 * Cadastro manual de colaborador (Fase 1) — quem preenche é o Admin/Gerente
 * da EficazBr, com os dados repassados pela Havan; o link de autoatendimento
 * (Fase 2) reaproveita o mesmo model, só troca quem preenche o formulário.
 */
export async function createConvenioMemberAction(convenioId: string, input: ConvenioMemberInput) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  const parsed = convenioMemberSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const convenio = await prisma.convenio.findFirst({
    where: { id: convenioId, tenantId: user.tenantId },
  });
  if (!convenio) return { error: "Convênio não encontrado." };

  const duplicate = await prisma.convenioMember.findFirst({
    where: { convenioId, document: parsed.data.document },
  });
  if (duplicate) return { error: "Esse CPF já está cadastrado neste convênio." };

  const { rawToken, hashedToken } = generateResetToken();
  await prisma.convenioMember.create({
    data: {
      tenantId: user.tenantId,
      convenioId,
      name: parsed.data.name,
      document: parsed.data.document,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      selfieUrl: parsed.data.selfieUrl,
      proofUrl: parsed.data.proofUrl,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
      credentialTokenHash: hashedToken,
    },
  });

  revalidatePath(`/convenios/${convenioId}`);
  return { success: "Colaborador cadastrado.", credentialUrl: credentialUrl(rawToken) };
}

/**
 * Aprovar, suspender, bloquear ou cancelar um colaborador — sempre com
 * motivo e autor registrados, mesma convenção de `Device.statusChangedById`.
 */
export async function updateConvenioMemberStatusAction(
  memberId: string,
  input: UpdateConvenioMemberStatusInput
) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;
  const parsed = updateConvenioMemberStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const member = await prisma.convenioMember.findFirst({
    where: { id: memberId, tenantId: user.tenantId },
  });
  if (!member) return { error: "Colaborador não encontrado." };

  await prisma.convenioMember.update({
    where: { id: memberId },
    data: {
      status: parsed.data.status,
      statusReason: parsed.data.reason || null,
      statusChangedById: user.id,
      statusChangedAt: new Date(),
    },
  });

  revalidatePath(`/convenios/${member.convenioId}`);
  return { success: "Status do colaborador atualizado." };
}

function inviteUrl(slug: string, rawToken: string) {
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${origin}/convenio/${slug}/${rawToken}`;
}

/** URL da "carteirinha" — status do cadastro e, quando ativo, o QR Code (ver `/c/[token]`). */
function credentialUrl(rawToken: string) {
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${origin}/c/${rawToken}`;
}

/**
 * Sempre gera um link novo, revogando qualquer outro ainda ativo — só um
 * convite "vivo" por vez (o mesmo espírito de "compartilhar um link só no
 * grupo da empresa"). Não dá pra "reaproveitar e mostrar de novo" um convite
 * já existente: só o hash do token fica salvo (ver `ConvenioInvite.tokenHash`,
 * mesmo padrão de `User.resetToken`), então a URL completa só existe aqui,
 * no instante em que é gerada — se o Admin perder o link, o jeito é gerar
 * outro (e o antigo já para de funcionar).
 */
export async function getOrCreateConvenioInviteAction(convenioId: string) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const convenio = await prisma.convenio.findFirst({
    where: { id: convenioId, tenantId: user.tenantId },
  });
  if (!convenio) return { error: "Convênio não encontrado." };

  const { rawToken, hashedToken } = generateResetToken();
  const invite = await prisma.$transaction(async (tx) => {
    await tx.convenioInvite.updateMany({
      where: { convenioId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.convenioInvite.create({
      data: { tenantId: user.tenantId, convenioId, tokenHash: hashedToken, createdById: user.id },
    });
  });

  revalidatePath(`/convenios/${convenioId}`);
  return { success: "Link de convite gerado.", inviteId: invite.id, url: inviteUrl(convenio.slug, rawToken) };
}

/** Invalida o link — quem já tinha o link antigo não consegue mais se cadastrar por ele. */
export async function revokeConvenioInviteAction(inviteId: string) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const invite = await prisma.convenioInvite.findFirst({
    where: { id: inviteId, tenantId: user.tenantId },
  });
  if (!invite) return { error: "Convite não encontrado." };

  await prisma.convenioInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });

  revalidatePath(`/convenios/${invite.convenioId}`);
  return { success: "Link revogado." };
}
