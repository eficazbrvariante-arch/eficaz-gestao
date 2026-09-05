import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { resolveStoreBasePath } from "@/modules/pwa/store-scope";

/**
 * Versão do Service Worker. Muda a cada deploy, o que é o gatilho para o
 * navegador baixar o script novo, trocar os caches e oferecer a atualização.
 * Em desenvolvimento fica fixa — o corpo do script não muda, então não há
 * ciclo de atualização para testar localmente.
 */
function cacheVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev";
}

/**
 * Service Worker da loja pública, gerado por tenant.
 *
 * Estratégia deliberadamente mínima. O que ele **não** faz é tão importante
 * quanto o que faz:
 *
 * - Nunca intercepta `POST`/`PUT`/`DELETE` — Server Actions, checkout,
 *   login e rastreio passam direto para a rede, sempre.
 * - Nunca guarda HTML, payload RSC ou resposta de `/api/`. Preço, estoque,
 *   promoção, carrinho, conta, Crédito Eficaz e Proteção Eficaz continuam
 *   vindo do servidor a cada carregamento, sem exceção — o servidor segue
 *   sendo a única fonte de verdade, e nenhuma compra pode ser fechada com
 *   valor guardado no dispositivo.
 * - Nunca alcança o painel, o PDV ou o caixa: o escopo é o caminho da loja, o
 *   que o próprio navegador garante.
 *
 * O cache existe só para o que é imutável ou puramente visual: a página
 * offline, os ícones da PWA e os arquivos versionados do Next (estes últimos
 * só quando a loja tem domínio próprio, onde o escopo alcança `/_next/`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
): Promise<Response> {
  const { subdomain } = await params;

  const store = await getStoreBySubdomain(subdomain);
  if (!store) {
    return new Response("// Loja não encontrada.", {
      status: 404,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  const base = await resolveStoreBasePath(request.headers.get("host"), subdomain);
  const storePath = `/loja/${subdomain}`;

  const script = `// Service Worker da loja "${subdomain}" — gerado por
// src/app/loja/[subdomain]/sw.js/route.ts. Não editar à mão.
"use strict";

const VERSION = ${JSON.stringify(cacheVersion())};
const BASE = ${JSON.stringify(base)};
const OFFLINE_URL = ${JSON.stringify(`${storePath}/offline`)};
const ICON_URL = ${JSON.stringify(`${storePath}/icones/192.png`)};

const CACHE = "eficaz-loja-" + ${JSON.stringify(subdomain)} + "-" + VERSION;

// Guardado no install para que a tela offline sempre exista quando for precisa.
const PRECACHE_URLS = [OFFLINE_URL, ICON_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Sem skipWaiting aqui de propósito: trocar o worker no meio de uma sessão
  // (um checkout, por exemplo) tem que ser decisão do visitante. Quem dispara
  // é a mensagem SKIP_WAITING, enviada só quando ele clica em "Atualizar".
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => (key === CACHE ? null : caches.delete(key))))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Arquivo imutável, seguro para servir do cache sem revalidar. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith(${JSON.stringify(`${storePath}/icones/`)})
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Só GET. Tudo que grava (Server Action, checkout, login, rastreio) passa
  // direto, sem o Service Worker no caminho.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Outro domínio (imagens do Blob, fontes) e qualquer coisa fora do escopo
  // desta loja ficam de fora.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;

  // Rotas de API nunca são cacheadas nem interceptadas.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith(BASE + "api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response && response.ok && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navegação: sempre rede. O cache só entra quando a rede falhou, e apenas
  // para mostrar a tela offline — nunca uma versão antiga da loja, que poderia
  // exibir preço, estoque ou promoção desatualizados.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then(
            (hit) =>
              hit ||
              new Response("Você está sem conexão.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              })
          )
      )
    );
    return;
  }

  // Todo o resto (payload RSC, dados) vai para a rede sem passar por cache.
});
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // O próprio script nunca pode vir de cache, senão o navegador não
      // percebe uma versão nova depois do deploy.
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
