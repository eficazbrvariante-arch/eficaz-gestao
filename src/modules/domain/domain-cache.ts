import { prisma } from "@/lib/prisma";

/**
 * Cache do mapeamento domínio próprio → subdomínio da loja.
 *
 * O proxy roda em toda requisição; consultar o banco a cada uma tornaria o
 * catálogo lento e caro. Como a troca de domínio é rara, um cache curto em
 * memória resolve: no pior caso a mudança demora até 60s para valer.
 *
 * Cada instância do servidor tem o próprio cache — em ambiente serverless isso
 * é esperado e não causa inconsistência, só significa que cada instância
 * consulta uma vez por janela.
 */

const TTL_MS = 60_000;

type Entry = { subdomain: string | null; expiresAt: number };

const cache = new Map<string, Entry>();

/**
 * Subdomínio da loja que responde por este domínio próprio, ou `null`.
 * Só domínios com posse verificada valem — um domínio meramente cadastrado
 * não pode sequestrar a loja de ninguém.
 */
export async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const key = hostname.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.subdomain;

  let subdomain: string | null = null;
  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        customDomain: key,
        catalogEnabled: true,
        domainStatus: { in: ["VERIFIED", "ACTIVE"] },
      },
      select: { subdomain: true },
    });
    subdomain = tenant?.subdomain ?? null;
  } catch {
    // Banco indisponível: não derruba a requisição, apenas não resolve o
    // domínio nesta passada (e não guarda o resultado no cache).
    return cached?.subdomain ?? null;
  }

  cache.set(key, { subdomain, expiresAt: Date.now() + TTL_MS });
  return subdomain;
}

/** Limpa o cache de um domínio, para uma troca valer imediatamente. */
export function invalidateDomainCache(hostname?: string) {
  if (hostname) cache.delete(hostname.toLowerCase());
  else cache.clear();
}
