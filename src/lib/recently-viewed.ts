/**
 * IDs de produto vistos recentemente pelo visitante, usados por
 * `listRecommendedFor` na home da loja. Guardado em cookie (não localStorage)
 * porque a home é renderizada no servidor e precisa ler a lista sem round-trip.
 *
 * Um cookie por subdomínio: o catálogo também é acessível por caminho
 * (`/loja/[subdominio]`) sob o mesmo domínio raiz, então um cookie único
 * vazaria "visto recentemente" entre lojas diferentes.
 */
const MAX_ENTRIES = 10;

export function recentlyViewedCookieName(subdomain: string) {
  return `rv_${subdomain}`;
}

export function parseRecentlyViewed(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export { MAX_ENTRIES as RECENTLY_VIEWED_MAX_ENTRIES };
