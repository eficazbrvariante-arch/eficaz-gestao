"use client";

/**
 * Estado do popup da Oferta Relâmpago, só no `sessionStorage` do navegador —
 * some sozinho quando a aba fecha, o que já cobre "não mostrar de novo na
 * sessão" depois de fechar (por 5 min) ou de comprar (pro resto da sessão).
 * Fica separado de `flash-deal-service.ts` (que importa `prisma`) para nunca
 * ser arrastado pro bundle do cliente.
 */
type FlashPopupState = {
  /** Identifica a oferta pelo produto — se amanhã for outro produto, o estado antigo é ignorado. */
  dealKey: string;
  closedAt: number | null;
  purchased: boolean;
};

function storageKey(subdomain: string) {
  return `eficaz-gestao:flash-popup:${subdomain}`;
}

export function readFlashPopupState(subdomain: string): FlashPopupState | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(subdomain));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const state = parsed as Record<string, unknown>;
    if (
      typeof state.dealKey !== "string" ||
      (state.closedAt !== null && typeof state.closedAt !== "number") ||
      typeof state.purchased !== "boolean"
    ) {
      return null;
    }
    return state as FlashPopupState;
  } catch {
    return null;
  }
}

function writeFlashPopupState(subdomain: string, state: FlashPopupState) {
  try {
    window.sessionStorage.setItem(storageKey(subdomain), JSON.stringify(state));
  } catch {
    // sessionStorage indisponível (modo privativo etc.): o popup só perde a
    // memória entre navegações, não é crítico.
  }
}

export function markFlashPopupClosed(subdomain: string, dealKey: string) {
  writeFlashPopupState(subdomain, { dealKey, closedAt: Date.now(), purchased: false });
}

/** Chamado no sucesso do checkout — não precisa saber qual produto era a oferta do dia. */
export function markFlashDealPurchased(subdomain: string) {
  const current = readFlashPopupState(subdomain);
  writeFlashPopupState(subdomain, {
    dealKey: current?.dealKey ?? "",
    closedAt: current?.closedAt ?? null,
    purchased: true,
  });
}
