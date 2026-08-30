"use client";

import { useState, useTransition } from "react";
import { setCreditoEficazPausedAction } from "./actions";

/**
 * Botão de pausa de emergência (Adendo) — mesmo esqueleto de
 * `PdvRankingToggle`, só que o estado "ligado" (verde) aqui significa
 * "ativo/usável", e "pausado" (vermelho) bloqueia só NOVO uso.
 */
export function CreditoEficazPauseToggle({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function toggle() {
    const next = !paused;
    setError(undefined);
    startTransition(async () => {
      const result = await setCreditoEficazPausedAction(next);
      if (result?.error) setError(result.error);
      else setPaused(next);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={paused}
        className={
          "flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors " +
          (paused
            ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
            : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700")
        }
      >
        <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />
        {isPending
          ? "Salvando..."
          : paused
            ? "Crédito Eficaz: Pausado"
            : "Crédito Eficaz: Ativo"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
