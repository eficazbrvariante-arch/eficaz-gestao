"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";
import { FlashDealIcon, ShieldLockIcon, TruckIcon, AwardIcon } from "./icons";
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

/** Sinais de confiança do popup — cada um só aparece se for real pra essa loja
 * (mesmo princípio da `TrustBar`), nunca uma afirmação fixa no componente. */
type FlashDealTrust = {
  cityLabel: string | null;
  deliveryEnabled: boolean;
  hasWarranty: boolean;
  storeName: string;
};

export function FlashSalePopup({
  subdomain,
  base,
  deal,
  trust,
}: {
  subdomain: string;
  base: string;
  deal: ResolvedFlashDeal;
  trust: FlashDealTrust;
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

  const trustItems = [
    trust.deliveryEnabled && trust.cityLabel
      ? { key: "delivery", icon: TruckIcon, label: `Entrega em ${trust.cityLabel}` }
      : null,
    { key: "secure", icon: ShieldLockIcon, label: "Compra Segura" },
    trust.hasWarranty ? { key: "warranty", icon: AwardIcon, label: `Garantia ${trust.storeName}` } : null,
  ].filter((item): item is { key: string; icon: typeof TruckIcon; label: string } => item !== null);

  // Degradê vermelho → vinho a partir da cor configurada pelo lojista (nunca fixo no
  // código — cada loja pode ter outra cor). `color-mix` escurece a própria cor de fundo.
  const cardBackground = `linear-gradient(160deg, ${deal.bgColor}, color-mix(in srgb, ${deal.bgColor} 55%, black))`;

  return (
    <div
      className={
        "fixed inset-x-3 bottom-28 z-50 sm:inset-x-auto sm:bottom-10 sm:left-6 sm:w-[26rem] " +
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
        @keyframes flash-image-glow {
          0%, 100% { opacity: .35; }
          50% { opacity: .6; }
        }
        .animate-flash-pop { animation: flash-pop .7s cubic-bezier(.34,1.56,.64,1) both; }
        .animate-flash-soft-in { animation: flash-soft-in .5s ease-out both; }
        .flash-sweep-overlay { animation: flash-sweep .8s ease-out both; }
        .flash-badge-glow { animation: flash-badge-glow 1.6s ease-in-out infinite; }
        .flash-image-glow { animation: flash-image-glow 2.4s ease-in-out infinite; }
      `}</style>

      <div
        className="relative max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-3xl p-5 text-white shadow-2xl"
        style={{ background: cardBackground }}
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
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30"
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

        {/* Selo "Só hoje" */}
        <div className="flex items-center gap-2 pr-8">
          <span
            className="flash-badge-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: deal.accentColor, "--flash-glow": deal.accentColor } as React.CSSProperties}
          >
            <FlashDealIcon icon={deal.icon} className="h-5 w-5 text-white" />
          </span>
          <p className="truncate text-base font-extrabold uppercase tracking-wide sm:text-lg">
            {deal.badgeText || "Só hoje!"}
          </p>
        </div>

        {/* Produto: foto grande em destaque + preço */}
        <div className="mt-4 flex items-start gap-4">
          <div className="relative w-[40%] shrink-0">
            {deal.imageUrl && (
              <span
                className="flash-image-glow pointer-events-none absolute -inset-3 rounded-full blur-xl"
                style={{ backgroundColor: deal.accentColor }}
                aria-hidden="true"
              />
            )}
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              {deal.imageUrl ? (
                // URL cadastrada pela empresa; domínio desconhecido em build time.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={deal.imageUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                  sem foto
                </div>
              )}
            </div>
            <span
              className="absolute -left-2 -top-2 -rotate-6 rounded-md px-2 py-0.5 text-[11px] font-extrabold text-slate-900 shadow-md"
              style={{ backgroundColor: deal.accentColor }}
            >
              -{deal.savingsPercent}%
            </span>
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <p className="line-clamp-2 text-sm font-semibold">{deal.productName}</p>

            <div className="mt-2">
              <span className="block text-xs text-white/60 line-through">
                {formatBRL(deal.basePrice)}
              </span>
              <span className="block text-3xl font-extrabold leading-tight sm:text-4xl">
                {formatBRL(deal.promoPrice)}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-900"
                style={{ backgroundColor: deal.accentColor }}
              >
                Economize {formatBRL(deal.savingsAmount)}
              </span>
              <FlashDealCountdown endsAt={deal.endsAt} />
            </div>
          </div>
        </div>

        {addCapped && (
          <p className="mt-3 text-xs font-medium text-amber-200">
            Limite de {deal.orderLimit} unidade{deal.orderLimit === 1 ? "" : "s"} por oferta —
            já está no seu carrinho.
          </p>
        )}

        <button
          type="button"
          onClick={handleBuyNow}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3.5 text-base font-extrabold text-white shadow-lg transition-all duration-150 hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-900/40 active:translate-y-0 active:scale-[0.98]"
        >
          {addCapped ? "Ver carrinho" : "Comprar Agora"}
        </button>

        {trustItems.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-white/15 pt-3">
            {trustItems.map(({ key, icon: Icon, label }) => (
              <span key={key} className="flex items-center gap-1 text-[10px] font-medium text-white/85">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
