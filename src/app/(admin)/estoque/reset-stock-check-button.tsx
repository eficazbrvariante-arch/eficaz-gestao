"use client";

import { useState, useTransition } from "react";
import { resetStockCheckQueueAction } from "./actions";

export function ResetStockCheckButton() {
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !window.confirm(
        "Isso enche a fila do Colaborador de Estoque de novo com todos os produtos ativos. Continuar?"
      )
    ) {
      return;
    }
    setMessage(undefined);
    startTransition(async () => {
      const result = await resetStockCheckQueueAction();
      if (result?.error) {
        setMessage(result.error);
        return;
      }
      setMessage(`Contagem reiniciada — ${result?.count ?? 0} produto(s) voltaram pra fila.`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? "Reiniciando..." : "Reiniciar contagem"}
      </button>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
