"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageConvenios } from "@/lib/permissions";
import { generateResetToken } from "@/lib/tokens";
import { inviteUrl } from "@/modules/convenios/invite-url";
import { generateUniqueConvenioShortCode } from "@/modules/convenios/convenio-redemption-service";
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
  const shortCode = await generateUniqueConvenioShortCode(user.tenantId);
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
      shortCode,
    },
  });

  revalidatePath(`/convenios/${convenioId}`);
  return { success: "Colaborador cadastrado.", credentialUrl: credentialUrl(rawToken), shortCode };
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

/** URL da "carteirinha" — status do cadastro e, quando ativo, o QR Code (ver `/c/[token]`). */
function credentialUrl(rawToken: string) {
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${origin}/c/${rawToken}`;
}

/**
 * Sempre gera um link novo, revogando qualquer outro ainda ativo — só um
 * convite "vivo" por vez (o mesmo espírito de "compartilhar um link só no
 * grupo da empresa"). O token também fica salvo em texto puro
 * (`ConvenioInvite.token`) só para a tela poder reexibir o link ativo depois
 * — quem valida o cadastro em `/convenio/[slug]/[token]` continua sendo o
 * hash (`tokenHash`).
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
      data: {
        tenantId: user.tenantId,
        convenioId,
        tokenHash: hashedToken,
        token: rawToken,
        createdById: user.id,
      },
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

export type ConvenioDiscountProductOption = {
  id: string;
  name: string;
  salePrice: number;
  /** 0 quando o produto ainda não tem desconto neste convênio. */
  discountAmount: number;
};

/**
 * Busca produto ativo e visível no catálogo online pelo nome, pra definir/
 * remover o desconto exclusivo dele neste convênio — ver `ProdutosDescontoPicker`.
 * Exclui produto `!showInCatalog` (ex.: película/capinha, venda exclusiva de
 * balcão): não faz sentido dar desconto "no site" num produto que nunca
 * aparece lá — a vitrine do cliente linka pra página do produto, que daria
 * 404 nesse caso.
 */
export async function searchProductsForConvenioDiscountAction(
  convenioId: string,
  query: string
): Promise<ConvenioDiscountProductOption[]> {
  const auth = await requireConvenioManager();
  if ("error" in auth) return [];
  const { user } = auth;
  const term = query.trim();
  if (term.length < 2) return [];

  const convenio = await prisma.convenio.findFirst({
    where: { id: convenioId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!convenio) return [];

  const products = await prisma.product.findMany({
    where: {
      tenantId: user.tenantId,
      active: true,
      showInCatalog: true,
      name: { contains: term, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      salePrice: true,
      convenioDiscounts: { where: { convenioId }, select: { discountAmount: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    salePrice: Number(p.salePrice),
    discountAmount: Number(p.convenioDiscounts[0]?.discountAmount ?? 0),
  }));
}

/** Define (amount > 0) ou remove (amount <= 0) o desconto exclusivo de um produto neste convênio. */
export async function setConvenioProductDiscountAction(
  convenioId: string,
  productId: string,
  amount: number
) {
  const auth = await requireConvenioManager();
  if ("error" in auth) return { error: "Seu perfil não tem permissão para configurar convênios." };
  const { user } = auth;

  const convenio = await prisma.convenio.findFirst({
    where: { id: convenioId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!convenio) return { error: "Convênio não encontrado." };

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId },
    select: { id: true, showInCatalog: true },
  });
  if (!product) return { error: "Produto não encontrado." };
  if (amount > 0 && !product.showInCatalog) {
    return { error: "Esse produto não aparece no catálogo online — não dá pra dar desconto exclusivo do site nele." };
  }

  if (amount > 0) {
    await prisma.convenioProductDiscount.upsert({
      where: { convenioId_productId: { convenioId, productId } },
      create: { tenantId: user.tenantId, convenioId, productId, discountAmount: amount },
      update: { discountAmount: amount },
    });
  } else {
    await prisma.convenioProductDiscount.deleteMany({ where: { convenioId, productId } });
  }

  revalidatePath(`/convenios/${convenioId}`);
  revalidatePath("/produtos");
  return { success: amount > 0 ? "Desconto do produto atualizado." : "Desconto removido do produto." };
}
