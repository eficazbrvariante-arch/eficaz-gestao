import type { MetadataRoute } from "next";
import { getStoreBySubdomain, storeDisplayName } from "@/modules/catalog/tenant-resolver";
import { normalizeHexColor } from "@/modules/pwa/store-icon";
import { resolveStoreBasePath } from "@/modules/pwa/store-scope";

/** Rótulo do ícone na tela inicial — o Android corta perto de 12 caracteres. */
function shortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 12) return trimmed;
  // Corta na palavra, não no meio dela.
  const cut = trimmed.slice(0, 12);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 3 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Web App Manifest da loja pública, montado por tenant.
 *
 * `scope`/`start_url` saem de `resolveStoreBasePath` — no host compartilhado a
 * PWA fica presa em `/loja/<subdominio>/`, o que impede por construção que o
 * Service Worker alcance painel, PDV ou caixa.
 *
 * Sem `orientation` de propósito: a mesma loja é usada em celular, tablet e
 * desktop, e travar em retrato prejudicaria os dois últimos.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
): Promise<Response> {
  const { subdomain } = await params;

  const store = await getStoreBySubdomain(subdomain);
  if (!store) {
    return new Response("Loja não encontrada.", { status: 404 });
  }

  const base = await resolveStoreBasePath(request.headers.get("host"), subdomain);
  const name = storeDisplayName(store);
  const themeColor = normalizeHexColor(store.primaryColor) ?? "#0f172a";

  // Caminho absoluto: os ícones respondem no mesmo lugar em qualquer host,
  // inclusive quando `base` é "/" num domínio próprio.
  const icons = `/loja/${subdomain}/icones`;

  const manifest: MetadataRoute.Manifest = {
    // `id` fixa a identidade do app instalado: mudar `start_url` depois não
    // faz o navegador tratar como um aplicativo diferente.
    id: base,
    name,
    short_name: shortName(name),
    description: `Catálogo online da ${name}. Veja os produtos e compre pelo celular.`,
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
    lang: "pt-BR",
    dir: "ltr",
    categories: ["shopping"],
    icons: [
      { src: `${icons}/192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${icons}/512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `${icons}/maskable-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${icons}/maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // Curto: trocar nome/cor/logo no painel precisa refletir no app sem
      // esperar o navegador expirar um cache longo.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
