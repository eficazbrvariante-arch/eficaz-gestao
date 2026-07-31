"use client";

import { useState } from "react";

/**
 * Campo somente leitura com botão de copiar.
 * Usado nos registros de DNS, onde errar um caractere ao digitar à mão
 * é a causa mais comum de a verificação não funcionar.
 */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o texto continua
      // selecionável no campo.
    }
  }

  return (
    <div>
      {label && <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>}
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
