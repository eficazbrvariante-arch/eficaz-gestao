"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Registra o Service Worker da loja e avisa, de forma discreta, quando existe
 * uma versão nova esperando.
 *
 * A troca nunca acontece sozinha: o worker novo fica em `waiting` até o
 * visitante clicar em "Atualizar". Recarregar por conta própria poderia
 * derrubar um checkout em andamento. Pelo mesmo motivo o aviso nem aparece
 * enquanto ele está no checkout — ali a atualização espera.
 */
export function PwaRegister({ swUrl, scope }: { swUrl: string; scope: string }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const reloading = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register(swUrl, { scope, updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;

        // `controller` nulo significa primeira instalação: não é atualização,
        // é a PWA entrando em funcionamento — nada a avisar.
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
              setDismissed(false);
            }
          });
        });
      })
      .catch(() => {
        // Sem Service Worker a loja continua funcionando normalmente pelo
        // navegador — falhar aqui não pode atrapalhar a navegação.
      });

    return () => {
      cancelled = true;
    };
  }, [swUrl, scope]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    function onControllerChange() {
      // Só recarrega se a troca foi pedida aqui. Sem essa guarda, um worker
      // assumindo o controle por outro motivo recarregaria a página do nada.
      if (reloading.current) window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  const update = useCallback(() => {
    if (!waiting) return;
    reloading.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, [waiting]);

  const inCheckout = pathname.includes("/checkout");
  if (!waiting || dismissed || inCheckout) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-20 z-40 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:right-auto sm:max-w-sm"
    >
      <p className="min-w-0 flex-1 text-sm text-slate-700">Uma nova versão está disponível.</p>
      <button
        type="button"
        onClick={update}
        className="shrink-0 rounded-lg bg-[var(--store-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--store-primary)]"
      >
        Atualizar
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dispensar aviso de atualização"
        className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
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
  );
}
