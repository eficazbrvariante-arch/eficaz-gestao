import type { MetadataRoute } from "next";

/**
 * Permissivo por padrão: a segurança do painel administrativo vem da
 * autenticação (ver `src/proxy.ts`), não deste arquivo — um robots.txt
 * restritivo não impediria acesso, só pediria a bots bem-comportados para
 * não indexar, e paths como "/produtos" significam coisas diferentes em
 * domínios diferentes (painel vs. loja reescrita por domínio próprio).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
