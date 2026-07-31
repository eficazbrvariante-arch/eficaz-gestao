"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/permissions";
import {
  normalizeDomain,
  generateDomainToken,
  verifyDomain,
} from "@/modules/domain/domain-service";
import { invalidateDomainCache } from "@/modules/domain/domain-cache";

export async function saveDomainAction(input: { domain: string }) {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para alterar o domínio." };
  }

  const parsed = normalizeDomain(input.domain ?? "");
  if (!parsed.ok) return { error: parsed.error };

  // Um domínio só pode pertencer a uma empresa.
  const taken = await prisma.tenant.findFirst({
    where: { customDomain: parsed.domain, NOT: { id: user.tenantId } },
    select: { id: true },
  });
  if (taken) {
    return { error: "Este domínio já está conectado a outra loja." };
  }

  const current = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { customDomain: true, domainToken: true },
  });

  // Trocar de domínio invalida a verificação anterior: gera um token novo.
  const isSameDomain = current.customDomain === parsed.domain;
  const token = isSameDomain && current.domainToken ? current.domainToken : generateDomainToken();

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      customDomain: parsed.domain,
      domainToken: token,
      ...(isSameDomain
        ? {}
        : { domainStatus: "PENDING", domainVerifiedAt: null, domainCheckedAt: null }),
    },
  });

  // O domínio antigo deixa de valer na hora; o novo entra assim que verificado.
  if (current.customDomain) invalidateDomainCache(current.customDomain);
  invalidateDomainCache(parsed.domain);

  revalidatePath("/configuracoes/dominio");
  return { success: "Domínio salvo. Agora crie os registros de DNS indicados abaixo." };
}

export async function verifyDomainAction() {
  const user = await requireUser();
  if (!canManageSettings(user.role)) {
    return { error: "Seu perfil não tem permissão para verificar o domínio." };
  }

  const result = await verifyDomain(user.tenantId);
  revalidatePath("/configuracoes/dominio");

  if (!result.ok) return { error: result.error };

  // Verificado agora passa a resolver no proxy — limpa o "não encontrado" cacheado.
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { customDomain: true },
  });
  if (tenant.customDomain) invalidateDomainCache(tenant.customDomain);

  return {
    success: result.pointing
      ? "Domínio verificado e no ar! Sua loja já responde por ele."
      : "Posse do domínio confirmada. Falta o apontamento (CNAME) propagar para a loja entrar no ar.",
  };
}

export async function removeDomainAction() {
  const user = await requireUser();
  if (!canManageSettings(user.role)) return;

  const current = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { customDomain: true },
  });

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      customDomain: null,
      domainToken: null,
      domainStatus: "NONE",
      domainVerifiedAt: null,
      domainCheckedAt: null,
    },
  });

  if (current.customDomain) invalidateDomainCache(current.customDomain);
  revalidatePath("/configuracoes/dominio");
}
