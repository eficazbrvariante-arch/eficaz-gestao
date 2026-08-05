"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "./icons";

function timeLeft(endsAt: Date) {
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}min ${seconds}s`;
}

/** Contagem regressiva leve, só para cards de oferta relâmpago — o resto do catálogo fica sem esse custo de JS. */
export function FlashDealCountdown({ endsAt }: { endsAt: Date }) {
  const [label, setLabel] = useState(() => timeLeft(endsAt));

  useEffect(() => {
    const id = window.setInterval(() => setLabel(timeLeft(endsAt)), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
      <ClockIcon className="h-3 w-3" />
      {label}
    </span>
  );
}
