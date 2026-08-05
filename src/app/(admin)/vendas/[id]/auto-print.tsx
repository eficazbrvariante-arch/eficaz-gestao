"use client";

import { useEffect, useRef } from "react";

/**
 * Dispara window.print() uma única vez quando a venda acabada de finalizar
 * cai nesta tela com a impressão automática ligada nas configurações do PDV.
 * O ref evita disparo duplicado no double-effect do modo dev do React.
 */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) return;
    firedRef.current = true;
    window.print();
  }, [enabled]);

  return null;
}
