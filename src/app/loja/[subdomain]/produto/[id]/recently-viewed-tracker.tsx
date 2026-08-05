"use client";

import { useEffect } from "react";
import {
  recentlyViewedCookieName,
  parseRecentlyViewed,
  RECENTLY_VIEWED_MAX_ENTRIES,
} from "@/lib/recently-viewed";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Sem UI — só grava o produto atual no cookie de "visto recentemente" ao abrir a página. */
export function RecentlyViewedTracker({
  subdomain,
  productId,
}: {
  subdomain: string;
  productId: string;
}) {
  useEffect(() => {
    const name = recentlyViewedCookieName(subdomain);
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    const current = parseRecentlyViewed(match ? decodeURIComponent(match[1]) : undefined);

    const next = [productId, ...current.filter((id) => id !== productId)].slice(
      0,
      RECENTLY_VIEWED_MAX_ENTRIES
    );

    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  }, [subdomain, productId]);

  return null;
}
