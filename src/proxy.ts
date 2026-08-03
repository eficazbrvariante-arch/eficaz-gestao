import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ROOT_DOMAIN, subdomainFromHost } from "@/modules/catalog/tenant-resolver";
import { resolveCustomDomain } from "@/modules/domain/domain-cache";

/** Rotas do painel acessíveis sem login. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/recuperar-senha",
  "/cadastro",
  "/sessao-expirada",
];

/** Prefixos totalmente públicos (catálogo online, comprovantes de OS). */
const PUBLIC_PREFIXES = ["/loja/", "/redefinir-senha/", "/comprovante/"];

/** Hostname sem a porta, em minúsculas. */
function hostnameOf(host: string | null) {
  return (host ?? "").split(":")[0].toLowerCase();
}

/**
 * O host é o domínio da própria aplicação (painel administrativo)?
 * Domínios próprios das lojas são qualquer outra coisa.
 */
function isAppHost(hostname: string) {
  return (
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname.endsWith(`.${ROOT_DOMAIN}`) ||
    hostname === "127.0.0.1" ||
    // Hosts de deploy (ex.: eficaz-gestao.vercel.app) servem o painel.
    hostname.endsWith(".vercel.app")
  );
}

export default auth(async (req) => {
  const { nextUrl } = req;
  const { pathname } = nextUrl;
  const hostname = hostnameOf(req.headers.get("host"));

  // robots.txt precisa responder igual em qualquer host (painel, subdomínio ou
  // domínio próprio da loja) — sem isso, era reescrito para /loja/<loja>/robots.txt
  // (404) num domínio próprio, ou exigia login no domínio do painel.
  if (pathname === "/robots.txt") {
    return NextResponse.next();
  }

  // Loja acessada por subdomínio (ex.: eficazbr.localhost:3000) é reescrita
  // internamente para /loja/[subdominio], mantendo a URL bonita no navegador.
  const subdomain = subdomainFromHost(req.headers.get("host"));
  if (subdomain && !pathname.startsWith("/loja/")) {
    const url = nextUrl.clone();
    url.pathname = `/loja/${subdomain}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // Loja acessada pelo domínio próprio da empresa. A consulta é cacheada em
  // memória para não bater no banco a cada requisição.
  if (!subdomain && !isAppHost(hostname) && !pathname.startsWith("/loja/")) {
    const store = await resolveCustomDomain(hostname);
    if (store) {
      const url = nextUrl.clone();
      url.pathname = `/loja/${store}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Colaborador de Estoque só pode ver a tela de ajuste rápido de estoque —
  // qualquer outra rota do painel (inclusive server actions, que também
  // passam por aqui) é barrada aqui, já que as páginas/actions individuais
  // nem sempre checam o papel. Sem isso esse papel enxergaria preços e telas
  // que não deveria.
  const STOCK_COLLABORATOR_ROUTE = "/colaborador-estoque";
  if (
    isLoggedIn &&
    req.auth!.user.role === "STOCK_COLLABORATOR" &&
    !isPublicRoute &&
    pathname !== STOCK_COLLABORATOR_ROUTE &&
    !pathname.startsWith(`${STOCK_COLLABORATOR_ROUTE}/`)
  ) {
    return NextResponse.redirect(new URL(STOCK_COLLABORATOR_ROUTE, nextUrl));
  }

  return NextResponse.next();
});

// Checagem otimista (só lê o cookie da sessão); a autorização de fato
// acontece na camada de acesso a dados (src/lib/session.ts).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
