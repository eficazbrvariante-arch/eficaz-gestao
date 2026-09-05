import { isAppHost, subdomainFromHost } from "@/modules/catalog/tenant-resolver";
import { resolveCustomDomain } from "@/modules/domain/domain-cache";

/**
 * Caminho base pelo qual esta loja é servida no host da requisição — e, por
 * consequência, o `scope` da PWA e o lugar onde o Service Worker é registrado.
 *
 * A mesma loja é alcançável por três caminhos (ver `src/proxy.ts`):
 *
 * - host público compartilhado → `/loja/<subdominio>/`
 * - domínio próprio da loja    → `/` (o proxy reescreve tudo para a loja)
 * - subdomínio `<sub>.ROOT`    → `/` (mesmo motivo)
 *
 * A distinção importa por segurança, não só por estética. No host
 * compartilhado, `www.eficazbr.com.br` também serve o painel administrativo em
 * `/` — um Service Worker com `scope: "/"` ali passaria a controlar rotas do
 * painel e do PDV. Prender o escopo em `/loja/<subdominio>/` faz o próprio
 * navegador impedir isso, sem depender de nenhuma regra do nosso lado.
 *
 * Por isso o "é domínio próprio?" é confirmado resolvendo o host de volta para
 * *esta* loja, e não com um `!isAppHost()` solto: `www.eficazbr.com.br` não é
 * `isAppHost` (o ROOT_DOMAIN em produção é `app.eficazbr.com.br`), e um teste
 * negativo daria `/` justamente no host onde isso seria perigoso.
 */
export async function resolveStoreBasePath(
  host: string | null,
  subdomain: string
): Promise<string> {
  const hostname = (host ?? "").split(":")[0].toLowerCase();

  // Loja acessada pelo próprio subdomínio: o proxy já reescreve `/` para ela.
  if (subdomainFromHost(host) === subdomain) return "/";

  // Domínio próprio: só vale se resolver de volta para esta mesma loja.
  if (hostname && !isAppHost(hostname)) {
    const resolved = await resolveCustomDomain(hostname);
    if (resolved === subdomain) return "/";
  }

  return `/loja/${subdomain}/`;
}
