import type { TrafficSource } from "@/generated/prisma/enums";

/**
 * Categoriza a origem do acesso a partir do `document.referrer`, capturado uma
 * única vez pelo cliente na criação da sessão (navegação interna nunca muda o
 * referrer, então isso nunca precisa ser recalculado depois).
 */
export function classifyTrafficSource(referrer: string | null | undefined): {
  source: TrafficSource;
  host: string | null;
} {
  if (!referrer) return { source: "DIRECT", host: null };

  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return { source: "OTHER", host: null };
  }

  if (host.includes("google.")) return { source: "GOOGLE", host };
  if (host.includes("instagram.com")) return { source: "INSTAGRAM", host };
  if (host.includes("facebook.com") || host.includes("fb.com")) return { source: "FACEBOOK", host };
  if (host.includes("whatsapp.com") || host.includes("wa.me")) return { source: "WHATSAPP", host };
  return { source: "OTHER", host };
}
