import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Domínio raiz onde os subdomínios das lojas são servidos.
 * Em produção vira `eficazgestao.com.br`; em desenvolvimento, `localhost`.
 */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost";

/**
 * Extrai o subdomínio da loja a partir do host da requisição.
 *
 * Retorna `null` quando o host é o próprio domínio raiz (onde fica o painel
 * administrativo) ou quando não há subdomínio — nesses casos o catálogo é
 * acessado pelo caminho `/loja/[subdominio]`.
 */
export function subdomainFromHost(host: string | null): string | null {
  if (!host) return null;

  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;

  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
    // `www` não é uma loja, e subdomínios compostos não são suportados.
    if (!sub || sub === "www" || sub.includes(".")) return null;
    return sub;
  }

  return null;
}

/**
 * Carrega a loja pública pelo subdomínio. Só retorna empresas com o catálogo
 * ativo — o `cache` do React evita recarregar dentro da mesma renderização.
 */
export const getStoreBySubdomain = cache(async (subdomain: string) => {
  return prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: {
      id: true,
      name: true,
      tradeName: true,
      subdomain: true,
      logoUrl: true,
      primaryColor: true,
      phone: true,
      whatsapp: true,
      addressStreet: true,
      addressNumber: true,
      addressCity: true,
      addressState: true,
      bannerUrl: true,
      bannerTitle: true,
      bannerSubtitle: true,
    },
  });
});

export type Store = NonNullable<Awaited<ReturnType<typeof getStoreBySubdomain>>>;

/** Nome de exibição da loja: prefere o nome fantasia. */
export function storeDisplayName(store: Pick<Store, "name" | "tradeName">) {
  return store.tradeName?.trim() || store.name;
}

/**
 * Busca a empresa por domínio customizado (usado pelo proxy para reescrever a rota).
 * O fluxo completo de cadastro e validação de domínio entra na Fase 7.
 */
export async function getStoreByCustomDomain(hostname: string) {
  return prisma.tenant.findFirst({
    where: { customDomain: hostname.toLowerCase(), catalogEnabled: true },
    select: { subdomain: true },
  });
}
