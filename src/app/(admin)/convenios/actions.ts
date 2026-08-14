"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageConvenios } from "@/lib/permissions";
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
    },
  });

  revalidatePath(`/convenios/${convenioId}`);
  redirect(`/convenios/${convenioId}`);
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
