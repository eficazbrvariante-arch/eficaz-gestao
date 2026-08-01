import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

/**
 * Usuário da sessão, reconferido no banco a cada requisição.
 *
 * A sessão é um cookie assinado que dura dias e carrega uma cópia dos dados de
 * quem entrou. Confiar apenas nela significaria que excluir, desativar ou
 * rebaixar alguém só passa a valer quando o cookie vence — um funcionário
 * desligado continuaria entrando, com o papel antigo. Por isso o banco é a
 * fonte da verdade, e é dele que sai o papel usado nas permissões.
 *
 * O `cache` do React garante uma consulta por renderização, não uma por chamada.
 */
export const requireUser = cache(async () => {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, name: true, email: true, role: true, tenantId: true, active: true },
  });

  if (!user || !user.active) {
    // Passa por uma rota que derruba a sessão: redirecionar direto para /login
    // com o cookie ainda válido faria o proxy devolver ao painel, em laço.
    redirect("/sessao-expirada");
  }

  return user;
});

/**
 * Empresa da sessão atual.
 *
 * Assim como o usuário, a empresa pode ter deixado de existir depois que o
 * cookie foi emitido (excluída, ou banco trocado em desenvolvimento). Nesse
 * caso o certo é derrubar a sessão, não estourar um erro 500 em toda página.
 */
export const requireTenant = cache(async () => {
  const user = await requireUser();
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });

  if (!tenant) {
    redirect("/sessao-expirada");
  }

  return { user, tenant };
});
