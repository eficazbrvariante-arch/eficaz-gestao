"use client";

/**
 * Memória do convite de instalação da PWA, só no navegador do visitante.
 *
 * A dispensa fica no `localStorage` e é **definitiva**: quem fechou o convite
 * não deve vê-lo de novo em visita nenhuma. O contador de páginas fica no
 * `sessionStorage` e serve só para não oferecer a instalação para quem acabou
 * de chegar — o convite espera o visitante demonstrar algum interesse.
 */

function dismissedKey(subdomain: string) {
  return `eficaz-gestao:install-invite-dismissed:${subdomain}`;
}

function pageCountKey(subdomain: string) {
  return `eficaz-gestao:install-invite-pages:${subdomain}`;
}

/** Páginas vistas antes de o convite poder aparecer. */
export const MIN_PAGES_BEFORE_INVITE = 2;

export function isInviteDismissed(subdomain: string): boolean {
  try {
    return window.localStorage.getItem(dismissedKey(subdomain)) !== null;
  } catch {
    // Storage indisponível (modo privativo): trata como dispensado. Errar para
    // o lado de não incomodar é melhor que insistir a cada página.
    return true;
  }
}

export function dismissInvite(subdomain: string) {
  try {
    window.localStorage.setItem(dismissedKey(subdomain), String(Date.now()));
  } catch {
    // Sem storage o convite reaparece na próxima navegação — nada a fazer.
  }
}

/** Incrementa e devolve quantas páginas da loja foram vistas nesta sessão. */
export function countPageView(subdomain: string): number {
  try {
    const current = Number(window.sessionStorage.getItem(pageCountKey(subdomain))) || 0;
    const next = current + 1;
    window.sessionStorage.setItem(pageCountKey(subdomain), String(next));
    return next;
  } catch {
    return 0;
  }
}
