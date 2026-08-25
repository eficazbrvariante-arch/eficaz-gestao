"use client";

import { useState, useTransition } from "react";
import { setPdvRankingEnabledAction } from "./actions";

/** Botão liga/desliga do Ranking no rodapé do PDV — o Admin decide na hora. */
export function PdvRankingToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function toggle() {
    const next = !enabled;
    setError(undefined);
    startTransition(async () => {
      const result = await setPdvRankingEnabledAction(next);
      if (result?.error) setError(result.error);
      else setEnabled(next);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={enabled}
        className={
          "flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors " +
          (enabled
            ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
        }
      >
        <span
          className={"h-2 w-2 rounded-full " + (enabled ? "bg-white" : "bg-slate-400")}
          aria-hidden="true"
        />
        {isPending ? "Salvando..." : enabled ? "Ranking no PDV: Ligado" : "Ranking no PDV: Desligado"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
