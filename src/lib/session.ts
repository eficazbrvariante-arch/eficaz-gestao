import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Empresa da sessão atual.
 *
 * A sessão guarda o `tenantId` num cookie assinado que dura dias, então ela pode
 * apontar para uma empresa que não existe mais (excluída, ou banco trocado em
 * desenvolvimento). Nesse caso o certo é mandar para o login em vez de estourar
 * um erro 500 em toda página do painel.
 *
 * O `cache` do React evita repetir a consulta dentro da mesma renderização.
 */
export const requireTenant = cache(async () => {
  const user = await requireUser();
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });

  if (!tenant) {
    // Passa por uma rota que derruba a sessão: redirecionar direto para /login
    // com o cookie ainda válido faria o proxy devolver ao painel, em laço.
    redirect("/sessao-expirada");
  }

  return { user, tenant };
});
