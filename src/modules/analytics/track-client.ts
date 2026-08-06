"use client";

/**
 * Rastreamento do funil de conversão da loja pública. Puramente client-side —
 * dois ids gerados no navegador (nunca um cookie do servidor, ver nota em
 * `flash-sale-popup.tsx`/`cart-store.ts` sobre não depender de `proxy.ts`):
 *
 * - `visitorId` (localStorage): identidade de longo prazo, conta "visitantes únicos".
 * - `sessionId` (sessionStorage): morre com a aba, conta "visitas".
 *
 * Nunca lança: uma falha aqui não pode quebrar a navegação do visitante.
 */

function visitorKey(subdomain: string) {
  return `eficaz-gestao:visitor:${subdomain}`;
}
function sessionKey(subdomain: string) {
  return `eficaz-gestao:session:${subdomain}`;
}
function sessionReferrerKey(subdomain: string) {
  return `eficaz-gestao:session-referrer:${subdomain}`;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateVisitorId(subdomain: string): string {
  try {
    const key = visitorKey(subdomain);
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Cria a sessão (se ainda não existir) e guarda o referrer da chegada junto — nunca
 * recalculado depois, já que navegação interna nunca muda `document.referrer`. */
export function getOrCreateSessionId(subdomain: string): string {
  try {
    const key = sessionKey(subdomain);
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    window.sessionStorage.setItem(key, id);
    window.sessionStorage.setItem(sessionReferrerKey(subdomain), document.referrer || "");
    return id;
  } catch {
    return randomId();
  }
}

export function getSessionReferrer(subdomain: string): string {
  try {
    return window.sessionStorage.getItem(sessionReferrerKey(subdomain)) ?? "";
  } catch {
    return "";
  }
}

type TrackableEventType =
  | "PAGE_VIEW"
  | "PRODUCT_VIEW"
  | "ADD_TO_CART"
  | "CHECKOUT_START"
  | "PURCHASE"
  | "FLASH_VIEW"
  | "FLASH_CLICK"
  | "HEARTBEAT";

export function trackEvent(
  subdomain: string,
  event: { type: TrackableEventType; path?: string; productId?: string; orderId?: string }
) {
  try {
    const sessionId = getOrCreateSessionId(subdomain);
    const payload = {
      subdomain,
      sessionId,
      visitorId: getOrCreateVisitorId(subdomain),
      referrer: getSessionReferrer(subdomain),
      ...event,
    };
    const body = JSON.stringify(payload);
    const url = "/api/track";

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // rastreamento nunca pode quebrar a navegação do visitante
  }
}
