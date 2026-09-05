import { ImageResponse } from "next/og";
import { getStoreBySubdomain, storeDisplayName } from "@/modules/catalog/tenant-resolver";
import {
  fetchLogoDataUri,
  logoScale,
  normalizeHexColor,
  parseIconVariant,
  readableTextOn,
  storeInitials,
} from "@/modules/pwa/store-icon";

/**
 * Ícones da PWA da loja, gerados sob demanda a partir do logo e da cor que a
 * empresa já cadastrou no painel — ver `src/modules/pwa/store-icon.ts`.
 *
 * O caminho termina em `.png` de propósito: o `matcher` do `proxy.ts` ignora
 * extensões de imagem, então estas requisições não passam pela resolução de
 * domínio/sessão a cada carregamento de ícone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subdomain: string; icone: string }> }
): Promise<Response> {
  const { subdomain, icone } = await params;

  const variant = parseIconVariant(icone);
  if (!variant) {
    return new Response("Ícone não encontrado.", { status: 404 });
  }

  const store = await getStoreBySubdomain(subdomain);
  if (!store) {
    return new Response("Loja não encontrada.", { status: 404 });
  }

  const { size } = variant;
  const logo = await fetchLogoDataUri(store.logoUrl);

  // Fundo branco quando existe logo: é o que a maioria das marcas espera, e o
  // iOS compõe ícone transparente sobre preto (logo escuro sumiria). Sem logo,
  // a cor da loja vira o fundo e as iniciais recebem preto ou branco conforme
  // o contraste.
  const brandColor = normalizeHexColor(store.primaryColor) ?? "#0f172a";
  const background = logo ? "#ffffff" : brandColor;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background,
        }}
      >
        {logo ? (
          // O Satori (motor do `ImageResponse`) só entende `<img>` — `next/image`
          // depende de runtime do navegador e não existe dentro do renderizador.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            width={Math.round(size * logoScale(variant))}
            height={Math.round(size * logoScale(variant))}
            style={{ objectFit: "contain" }}
            alt=""
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: Math.round(size * (variant.maskable ? 0.34 : 0.42)),
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: readableTextOn(background),
            }}
          >
            {storeInitials(storeDisplayName(store))}
          </div>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        // Uma hora de cache: trocar o logo no painel reflete no ícone em pouco
        // tempo, sem regerar a imagem a cada requisição.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    }
  );
}
