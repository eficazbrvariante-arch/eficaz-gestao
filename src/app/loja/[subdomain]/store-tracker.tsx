"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/modules/analytics/track-client";

const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Sem UI — dispara `PAGE_VIEW` a cada navegação e mantém um heartbeat leve
 * (só enquanto a aba está visível) pra "visitantes online agora" ficar correto
 * mesmo quando o visitante fica parado numa página sem navegar.
 */
export function StoreTracker({ subdomain }: { subdomain: string }) {
  const pathname = usePathname();

  useEffect(() => {
    trackEvent(subdomain, { type: "PAGE_VIEW", path: pathname });
  }, [subdomain, pathname]);

  useEffect(() => {
    function ping() {
      if (document.visibilityState === "visible") {
        trackEvent(subdomain, { type: "HEARTBEAT" });
      }
    }
    const id = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [subdomain]);

  return null;
}
