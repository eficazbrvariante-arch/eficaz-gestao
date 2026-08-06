"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";
import { FlashDealIcon } from "./icons";
import { FlashDealCountdown } from "./flash-deal-countdown";
import type { ResolvedFlashDeal } from "@/modules/catalog/flash-deal-service";
import { readFlashPopupState, markFlashPopupClosed } from "./flash-deal-popup-storage";

const CLOSE_COOLDOWN_MS = 5 * 60 * 1000;
const FIRST_SHOW_DELAY_MS = 2500;

/** "Ding" curto e discreto sintetizado (sem arquivo de áudio). Falha em silêncio se o
 * navegador bloquear áudio sem um gesto prévio do usuário — comportamento esperado. */
function playDing() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // autoplay bloqueado sem gesto prévio do usuário — silencioso, esperado.
  }
}

export function FlashSalePopup({
  subdomain,
  base,
  deal,
}: {
  subdomain: string;
  base: string;
  deal: ResolvedFlashDeal;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { addItem } = useCart();
  const [visible, setVisible] = useState(false);
  const [entrance, setEntrance] = useState<"hard" | "soft">("hard");
  const [addCapped, setAddCapped] = useState(false);

  const suppressed =
    pathname.includes("/carrinho") ||
    pathname.includes("/checkout") ||
    pathname.includes("/pedido/");

  useEffect(() => {
    if (suppressed) return;

    const stored = readFlashPopupState(subdomain);
    if (stored?.purchased) return;

    function showAs(kind: "hard" | "soft") {
      setEntrance(kind);
      setVisible(true);
      if (kind === "hard" && deal.soundEnabled) playDing();
    }

    if (stored?.dealKey === deal.productId && stored.closedAt) {
      const remaining = CLOSE_COOLDOWN_MS - (Date.now() - stored.closedAt);
      if (remaining <= 0) {
        showAs("soft");
        return;
      }
      const id = window.setTimeout(() => showAs("soft"), remaining);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => showAs("hard"), FIRST_SHOW_DELAY_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain, deal.productId, suppressed]);

  if (suppressed || !visible) return null;

  function handleClose() {
    markFlashPopupClosed(subdomain, deal.productId);
    setVisible(false);
    window.setTimeout(() => {
      setEntrance("soft");
      setVisible(true);
    }, CLOSE_COOLDOWN_MS);
  }

  function handleBuyNow() {
    if (deal.hasVariants) {
      router.push(`${base}/produto/${deal.productId}`);
      return;
    }
    if (addCapped) {
      router.push(`${base}/carrinho`);
      return;
    }
    const result = addItem(
      {
        productId: deal.productId,
        variantId: null,
        name: deal.productName,
        variantName: null,
        unitPrice: deal.promoPrice,
        imageUrl: deal.imageUrl,
        stockQty: deal.stockQty,
      },
      1
    );
    if (result.capped) {
      setAddCapped(true);
      return;
    }
    router.push(`${base}/carrinho`);
  }

  return (
    <div
      className={
        "fixed inset-x-3 bottom-28 z-50 sm:inset-x-auto sm:bottom-10 sm:left-6 sm:w-96 " +
        (entrance === "hard" ? "animate-flash-pop" : "animate-flash-soft-in")
      }
    >
      <style>{`
        @keyframes flash-pop {
          0% { opacity: 0; transform: translateY(24px) scale(.92); }
          60% { opacity: 1; transform: translateY(-4px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes flash-sweep {
          0% { opacity: 0; transform: translateX(-120%) skewX(-15deg); }
          15% { opacity: .8; }
          45% { opacity: 0; transform: translateX(160%) skewX(-15deg); }
          100% { opacity: 0; }
        }
        @keyframes flash-badge-glow {
          0%, 100% { box-shadow: 0 0 0 0 var(--flash-glow); }
          50% { box-shadow: 0 0 14px 4px var(--flash-glow); }
        }
        @keyframes flash-soft-in {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-flash-pop { animation: flash-pop .7s cubic-bezier(.34,1.56,.64,1) both; }
        .animate-flash-soft-in { animation: flash-soft-in .5s ease-out both; }
        .flash-sweep-overlay { animation: flash-sweep .8s ease-out both; }
        .flash-badge-glow { animation: flash-badge-glow 1.6s ease-in-out infinite; }
      `}</style>

      <div
        className="relative overflow-hidden rounded-2xl p-4 text-white shadow-2xl"
        style={{ backgroundColor: deal.bgColor }}
      >
        {entrance === "hard" && (
          <span
            className="flash-sweep-overlay pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            aria-hidden="true"
          />
        )}

        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-center gap-2 pr-6">
          <span
            className="flash-badge-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: deal.accentColor, "--flash-glow": deal.accentColor } as React.CSSProperties}
          >
            <FlashDealIcon icon={deal.icon} className="h-5 w-5 text-white" />
          </span>
          <p className="truncate text-sm font-semibold uppercase tracking-wide">
            {deal.badgeText || "Oferta Relâmpago"}
          </p>
        </div>

        <div className="mt-3 flex gap-3">
          {deal.imageUrl && (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/10">
              {/* URL cadastrada pela empresa; domínio desconhecido em build time. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={deal.imageUrl}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{deal.productName}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xs text-white/70 line-through">{formatBRL(deal.basePrice)}</span>
              <span className="text-lg font-bold">{formatBRL(deal.promoPrice)}</span>
            </div>
            <p className="text-xs text-white/90">
              Economize {formatBRL(deal.savingsAmount)} ({deal.savingsPercent}%)
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <FlashDealCountdown endsAt={deal.endsAt} />
          <div className="flex items-center gap-2">
            {addCapped && (
              <span className="text-xs font-medium text-white">
                Limite de {deal.orderLimit} unidade{deal.orderLimit === 1 ? "" : "s"} por oferta
              </span>
            )}
            <button
              type="button"
              onClick={handleBuyNow}
              className="shrink-0 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
            >
              {addCapped ? "Ver carrinho" : "Comprar Agora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
