"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  countPageView,
  dismissInvite,
  isInviteDismissed,
  MIN_PAGES_BEFORE_INVITE,
} from "./install-invite-storage";

/** Deixa a página assentar antes de a faixa aparecer. */
const INVITE_DELAY_MS = 1500;

/** O evento de instalação do Chrome não está na tipagem padrão do DOM. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Navegadores embutidos em aplicativos (Instagram, Facebook, WeChat) não
 * conseguem instalar nada — ensinar "toque em Compartilhar" ali só confundiria
 * quem chegou por um link do Instagram, que é boa parte do tráfego da loja.
 */
function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter/i.test(userAgent);
}

function isIOS(userAgent: string): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13+ manda User-Agent de macOS; o toque distingue os dois. Mesma
  // limitação já documentada em `analytics/device-classifier.ts`.
  return /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
}

/**
 * Navegador de iPhone que não é o Safari (Chrome, Firefox, Edge, Opera...).
 *
 * No iOS todos usam o mesmo motor, mas só o Safari adiciona a loja à tela
 * inicial como aplicativo: nos outros, o "Adicionar à Tela de Início" ou não
 * aparece, ou cria um atalho comum, que abre com a barra de endereço. Ensinar o
 * caminho do Safari ali leva a pessoa a um beco sem saída.
 *
 * A checagem procura a marca de cada navegador em vez de concluir pela ausência
 * de "Safari" no User-Agent: errar para o lado de mostrar a instrução normal é
 * bem menos ruim do que mandar quem já está no Safari abrir no Safari.
 */
function isNonSafariIOS(userAgent: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|YaBrowser/i.test(userAgent);
}

/** A loja já está aberta como aplicativo instalado? */
function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Safari no iOS não implementa `display-mode` e usa esta propriedade.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Convite discreto para instalar a loja na tela inicial.
 *
 * Regras de convivência, nesta ordem: não aparece para quem já instalou, para
 * quem já dispensou uma vez (a dispensa é definitiva), para quem acabou de
 * chegar, nem em carrinho, checkout ou conta — nenhuma compra é interrompida
 * por isto. É uma faixa no rodapé, nunca um modal.
 *
 * No Android e no desktop usa o evento `beforeinstallprompt`. No iOS, onde
 * esse evento não existe, mostra a instrução manual do Safari.
 */
export function InstallInvite({
  subdomain,
  storeName,
}: {
  subdomain: string;
  storeName: string;
}) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [precisaSafari, setPrecisaSafari] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pagesSeen = useRef(0);
  const pathname = usePathname();

  // Fluxos onde o convite nunca aparece — o visitante está comprando.
  const inPurchaseFlow = /\/(carrinho|checkout|conta)(\/|$)/.test(pathname);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Sempre impedido, mesmo quando a faixa não vai aparecer: sem isto o
      // Chrome mostra a própria barra de instalação, com o texto dele e na
      // hora dele.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setHidden(true);
      dismissInvite(subdomain);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [subdomain]);

  useEffect(() => {
    if (inPurchaseFlow) return;

    pagesSeen.current = countPageView(subdomain);

    const timer = window.setTimeout(() => {
      if (
        pagesSeen.current < MIN_PAGES_BEFORE_INVITE ||
        isInviteDismissed(subdomain) ||
        isStandalone() ||
        isInAppBrowser(navigator.userAgent)
      ) {
        return;
      }
      const ios = isIOS(navigator.userAgent);
      setIosHint(ios);
      setPrecisaSafari(ios && isNonSafariIOS(navigator.userAgent));
      setReady(true);
    }, INVITE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [subdomain, pathname, inPurchaseFlow]);

  const close = useCallback(() => {
    setHidden(true);
    dismissInvite(subdomain);
  }, [subdomain]);

  // O aviso continua na tela depois de copiar: a pessoa ainda precisa ler o
  // passo a passo para colar o link no Safari.
  const copiarLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopiado(true);
    } catch {
      // Sem permissão de área de transferência: a instrução por escrito basta.
    }
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    setHidden(true);
    try {
      await promptEvent.prompt();
      // Recusar o diálogo do sistema também conta como "não quero" — não
      // oferecer de novo depois disso.
      await promptEvent.userChoice;
    } catch {
      // Evento já consumido ou indisponível: nada a fazer.
    }
    dismissInvite(subdomain);
  }, [promptEvent, subdomain]);

  if (hidden || inPurchaseFlow || !ready) return null;
  // Sem o evento do Chrome e fora do iOS não há caminho de instalação para
  // oferecer — melhor não mostrar nada do que ensinar algo que não funciona.
  if (!promptEvent && !iosHint) return null;

  return (
    <div
      role="complementary"
      aria-label="Instalar aplicativo da loja"
      className="fixed bottom-4 left-4 right-20 z-40 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:right-auto sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Instale a {storeName}</p>
          <p className="mt-1 text-sm text-slate-600">
            Acesse nossa loja mais rápido diretamente da sua tela inicial.
          </p>

          {promptEvent ? (
            <button
              type="button"
              onClick={install}
              className="mt-3 rounded-lg bg-[var(--store-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--store-primary)]"
            >
              Instalar
            </button>
          ) : precisaSafari ? (
            <>
              <p className="mt-2 text-sm text-slate-500">
                No iPhone, a instalação só funciona pelo{" "}
                <span className="font-medium text-slate-700">Safari</span>. Abra esta página lá,
                toque em <span className="font-medium text-slate-700">Compartilhar</span> e depois
                em <span className="font-medium text-slate-700">Adicionar à Tela de Início</span>.
              </p>
              <button
                type="button"
                onClick={copiarLink}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--store-primary)]"
              >
                {linkCopiado ? "Link copiado" : "Copiar link da loja"}
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No iPhone: toque em <span className="font-medium text-slate-700">Compartilhar</span> e
              depois em{" "}
              <span className="font-medium text-slate-700">Adicionar à Tela de Início</span>.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Dispensar convite de instalação"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
