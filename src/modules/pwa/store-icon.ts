/**
 * Geração dos ícones da PWA a partir da identidade que a loja já tem cadastrada
 * (`Tenant.logoUrl` + `Tenant.primaryColor`) — nenhum asset estático novo, nenhuma
 * marca inventada. Quando a loja não tem logo, o ícone cai nas iniciais sobre a
 * cor da loja.
 */

/** Variantes que o manifest referencia. `maskable` reserva a zona de segurança do Android. */
export type IconVariant = {
  size: number;
  maskable: boolean;
};

/**
 * Aceita "192.png", "512.png", "maskable-192.png", "maskable-512.png" e
 * "apple-touch-180.png". Qualquer outra coisa é 404 — a rota não gera tamanho
 * arbitrário sob demanda para não virar vetor de custo de CPU.
 */
const VARIANTS: Record<string, IconVariant> = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-192.png": { size: 192, maskable: true },
  "maskable-512.png": { size: 512, maskable: true },
  // iOS não aplica máscara e não respeita `purpose: maskable`: o ícone é usado
  // inteiro, com cantos arredondados pelo próprio sistema. Por isso é uma
  // variante "any" em 180px, o tamanho que o Safari pede.
  "apple-touch-180.png": { size: 180, maskable: false },
};

export function parseIconVariant(param: string): IconVariant | null {
  return VARIANTS[param] ?? null;
}

/**
 * Fração do lado do ícone ocupada pelo logo. Em `maskable` o Android pode
 * recortar até um círculo inscrito, então o conteúdo precisa caber na zona de
 * segurança central (80% do lado) — 60% dá folga confortável dentro dela.
 */
export function logoScale(variant: IconVariant): number {
  return variant.maskable ? 0.6 : 0.78;
}

/** Luminância relativa (WCAG) de uma cor `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** `#rrggbb` válido, ou `null` — a cor vem do banco e pode estar em qualquer formato. */
export function normalizeHexColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  // Forma curta `#abc` também é aceita no cadastro.
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** Preto ou branco — o que tiver mais contraste sobre `background`. */
export function readableTextOn(background: string): string {
  return relativeLuminance(background) > 0.5 ? "#0f172a" : "#ffffff";
}

/** Até duas iniciais do nome da loja, para o ícone de fallback. */
export function storeInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && /\p{L}/u.test(word[0]));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/** Teto de bytes do logo embutido no ícone — o `ImageResponse` tem limite de 500KB de bundle. */
const MAX_LOGO_BYTES = 400_000;

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Baixa o logo da loja e devolve como data URI para o Satori embutir.
 *
 * Buscar aqui em vez de deixar o `<img src>` remoto para o Satori dá três
 * coisas que importam: limite de tamanho, validação de content-type e o
 * fallback silencioso para as iniciais quando o blob sumiu. Só aceita o storage
 * de blobs da própria plataforma — `logoUrl` vem do banco, e uma URL arbitrária
 * aqui seria uma requisição de saída controlada por quem edita o cadastro.
 *
 * SVG fica de fora de propósito: o suporte do Satori é parcial e um SVG quebrado
 * renderizaria um ícone vazio, pior que as iniciais.
 */
export async function fetchLogoDataUri(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;

  let url: URL;
  try {
    url = new URL(logoUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname.endsWith(".public.blob.vercel-storage.com")) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_LOGO_TYPES.has(contentType)) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) return null;

    return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    // Logo indisponível não pode derrubar o ícone — cai nas iniciais.
    return null;
  }
}
