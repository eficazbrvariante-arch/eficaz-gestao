import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAppHost, subdomainFromHost } from "@/modules/catalog/tenant-resolver";
import { resolveCustomDomain } from "@/modules/domain/domain-cache";

/** Rotas do painel acessíveis sem login. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/recuperar-senha",
  "/cadastro",
  "/sessao-expirada",
];

/** Prefixos totalmente públicos (catálogo online, comprovantes de OS, cadastro/carteirinha de convênio). */
const PUBLIC_PREFIXES = ["/loja/", "/redefinir-senha/", "/comprovante/", "/convenio/", "/c/"];

/** Hostname sem a porta, em minúsculas. */
function hostnameOf(host: string | null) {
  return (host ?? "").split(":")[0].toLowerCase();
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

  // Barra final. O redirect automático do Next está desligado
  // (`skipTrailingSlashRedirect` no next.config), então ele é reproduzido aqui
  // — com uma exceção: `/loja/<subdominio>/` é a `start_url` da PWA e precisa
  // continuar com a barra, senão cai fora do escopo do Service Worker. Nesse
  // caso a página é servida por rewrite interno, sem mudar a URL.
  if (pathname !== "/" && pathname.endsWith("/")) {
    // `nextUrl.clone()` não serve aqui: ele remonta a URL a partir do caminho
    // original e devolve a barra final, fazendo o redirect apontar para ele
    // mesmo (laço infinito). Por isso a URL de destino é montada do zero.
    const semBarra = pathname.slice(0, -1);
    const destino = new URL(`${semBarra}${nextUrl.search}`, nextUrl.origin);
    return /^\/loja\/[^/]+$/.test(semBarra)
      ? NextResponse.rewrite(destino)
      : NextResponse.redirect(destino, 308);
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

  // Colaborador de Estoque só pode ver a tela de ajuste rápido de estoque e a
  // de bater o próprio ponto — qualquer outra rota do painel (inclusive
  // server actions, que também passam por aqui) é barrada aqui, já que as
  // páginas/actions individuais nem sempre checam o papel. Sem isso esse
  // papel enxergaria preços e telas que não deveria.
  const STOCK_COLLABORATOR_ROUTES = ["/colaborador-estoque", "/ponto"];
  if (
    isLoggedIn &&
    req.auth!.user.role === "STOCK_COLLABORATOR" &&
    !isPublicRoute &&
    !STOCK_COLLABORATOR_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  ) {
    return NextResponse.redirect(new URL(STOCK_COLLABORATOR_ROUTES[0], nextUrl));
  }

  return NextResponse.next();
});

// Checagem otimista (só lê o cookie da sessão); a autorização de fato
// acontece na camada de acesso a dados (src/lib/session.ts).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
