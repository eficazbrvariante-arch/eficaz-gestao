import { notFound, redirect } from "next/navigation";
import { getStoreBySubdomain, type Store } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession, type ResolvedCustomerSession } from "@/modules/customers/customer-session";

/**
 * Boilerplate repetido em toda página de `/conta/**`: resolver a loja,
 * exigir sessão de cliente (redireciona pro login, preservando a rota atual
 * em `returnTo`) e devolver um `base` pronto pra montar links. Extraído da
 * versão que só existia em `conta/page.tsx` — mesmo comportamento de antes,
 * agora reusado pelas páginas de detalhe.
 */
export async function requireCustomerAccountSession(
  subdomain: string,
  pathname: string
): Promise<{ store: Store; session: ResolvedCustomerSession; base: string }> {
  const store = await getStoreBySubdomain(subdomain);
  if (!store) notFound();

  const base = `/loja/${subdomain}`;
  const session = await getCustomerSession(store.id);
  if (!session) {
    redirect(`${base}/conta/entrar?returnTo=${encodeURIComponent(pathname)}`);
  }

  return { store, session, base };
}
