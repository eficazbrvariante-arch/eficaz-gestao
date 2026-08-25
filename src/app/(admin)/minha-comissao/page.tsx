import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

/**
 * Atalho fixo pro item de navegação "Minha Comissão" — o link não pode
 * embutir o próprio id do usuário (a lista de navegação é estática, sem
 * acesso à sessão), então redireciona pra página real de comissão do
 * colaborador, sempre a do próprio usuário logado.
 */
export default async function MinhaComissaoPage() {
  const user = await requireUser();
  redirect(`/colaboradores/${user.id}/comissao`);
}
