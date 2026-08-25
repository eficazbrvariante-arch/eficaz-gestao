import { formatBRL } from "@/lib/format";
import type { SellerTierProgress } from "@/modules/employees/commission-tier-service";

export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/**
 * Laranja (início) → verde intermediário → verde forte (meta) — uma única
 * interpolação contínua, não blocos fixos, pra ficar elegante/premium em vez
 * de chamativo. `fraction` é 0..1 (quanto já andou até a faixa mais alta). O
 * verde forte é o `#39ff88` do tema Matrix, pra fechar exatamente na cor de
 * destaque já usada no resto do painel.
 */
export function tierProgressColor(fraction: number) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const orange: [number, number, number] = [249, 115, 22];
  const midGreen: [number, number, number] = [74, 222, 128];
  const strongGreen: [number, number, number] = [57, 255, 136];
  const [from, to, t] =
    clamped < 0.5 ? [orange, midGreen, clamped / 0.5] : [midGreen, strongGreen, (clamped - 0.5) / 0.5];
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(from[0], to[0])}, ${lerp(from[1], to[1])}, ${lerp(from[2], to[2])})`;
}

/** `hasMultipleTiers`/`topThreshold`/`fraction` — mesma conta em todo lugar que desenha a barra, pra nunca divergir. */
export function tierBarGeometry(tp: SellerTierProgress) {
  const hasMultipleTiers = tp.breakdown.length > 1;
  const topThreshold = hasMultipleTiers ? tp.breakdown[tp.breakdown.length - 1].minAmount : 0;
  const fraction = hasMultipleTiers && topThreshold > 0 ? Math.min(1, tp.tierEligibleSales / topThreshold) : 1;
  return { hasMultipleTiers, topThreshold, fraction, color: tierProgressColor(fraction) };
}

/** Badge "BRONZE · 1,5%" — nome e percentual da faixa atual, coloridos conforme o progresso. */
export function TierBadge({ tierProgress }: { tierProgress: SellerTierProgress }) {
  const { color } = tierBarGeometry(tierProgress);
  return (
    <span
      className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-wide"
      style={{ color, textShadow: `0 0 8px ${color}` }}
    >
      {tierProgress.currentTier.name} · {formatPercent(tierProgress.currentTier.percent)}
    </span>
  );
}

/** Barra de progresso com marcadores de cada faixa — laranja → verde → verde forte. */
export function TierProgressBar({ tierProgress }: { tierProgress: SellerTierProgress }) {
  const { hasMultipleTiers, topThreshold, fraction, color } = tierBarGeometry(tierProgress);
  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#0a1a10]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${fraction * 100}%`, background: color, boxShadow: `0 0 12px ${color}` }}
        />
        {hasMultipleTiers &&
          tierProgress.breakdown.map((b) => (
            <span
              key={b.name}
              aria-hidden="true"
              className="absolute top-0 h-full w-px bg-black/40"
              style={{ left: `${Math.min(100, (b.minAmount / topThreshold) * 100)}%` }}
            />
          ))}
      </div>
      {hasMultipleTiers && (
        <div className="relative mt-0.5 h-3 text-[9px] font-mono text-[#39ff88]/35">
          {tierProgress.breakdown.map((b) => (
            <span
              key={b.name}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${Math.min(100, (b.minAmount / topThreshold) * 100)}%` }}
            >
              {b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Os três indicadores: comissão, vendido, falta pra próxima faixa (ou meta atingida). */
export function TierIndicators({ tierProgress: tp }: { tierProgress: SellerTierProgress }) {
  const { hasMultipleTiers, color } = tierBarGeometry(tp);
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
        <p className="font-mono text-[9px] uppercase tracking-wide text-[#39ff88]/50">Comissão</p>
        <p className="font-mono text-xs font-semibold text-[#39ff88]">{formatBRL(tp.totalCommission)}</p>
      </div>
      <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
        <p className="font-mono text-[9px] uppercase tracking-wide text-[#39ff88]/50">Vendido</p>
        <p className="font-mono text-xs font-semibold" style={{ color }}>
          {formatBRL(tp.totalSales)}
        </p>
      </div>
      {hasMultipleTiers && tp.nextTier ? (
        <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
          <p className="font-mono text-[9px] uppercase tracking-wide text-[#f0b429]/70">Falta p/ {tp.nextTier.name}</p>
          <p className="font-mono text-xs font-semibold text-[#f0b429]">{formatBRL(tp.amountToNextTier ?? 0)}</p>
        </div>
      ) : hasMultipleTiers ? (
        <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
          <p className="font-mono text-[9px] uppercase tracking-wide text-[#39ff88]/70">Meta atingida</p>
          <p className="font-mono text-xs font-semibold text-[#39ff88]">
            {tp.amountAboveTopTier > 0 ? `+${formatBRL(tp.amountAboveTopTier)}` : "Faixa máxima"}
          </p>
        </div>
      ) : (
        <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
          <p className="font-mono text-[9px] uppercase tracking-wide text-[#39ff88]/40">Faixa</p>
          <p className="font-mono text-xs font-semibold text-[#39ff88]/60">Única configurada</p>
        </div>
      )}
    </div>
  );
}

/** Detalhamento do cálculo (faixa por faixa) + comissão por produto com % próprio, se houver. */
export function TierBreakdown({ tierProgress: tp }: { tierProgress: SellerTierProgress }) {
  const filledBreakdown = tp.breakdown.filter((b) => b.amountInTier > 0);

  return (
    <div className="space-y-1 font-mono text-xs text-[#39ff88]/80">
      <div className="flex justify-between">
        <span>Vendido no mês (total)</span>
        <span className="text-white">{formatBRL(tp.totalSales)}</span>
      </div>
      {tp.overrideSales > 0 && (
        <div className="flex justify-between">
          <span>— dos quais, com comissão própria (fora da faixa)</span>
          <span className="text-white">{formatBRL(tp.overrideSales)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Vendido elegível à faixa</span>
        <span className="text-white">{formatBRL(tp.tierEligibleSales)}</span>
      </div>
      {tp.nextTier ? (
        <div className="flex justify-between">
          <span>Falta para {tp.nextTier.name}</span>
          <span className="text-white">{formatBRL(tp.amountToNextTier ?? 0)}</span>
        </div>
      ) : (
        <div className="flex justify-between">
          <span>Faixa máxima</span>
          <span className="text-white">
            {tp.amountAboveTopTier > 0
              ? `${formatBRL(tp.amountAboveTopTier)} acima da faixa ${tp.currentTier.name}`
              : "Atingida"}
          </span>
        </div>
      )}

      {filledBreakdown.length > 0 && (
        <>
          <div className="my-2 border-t border-[#0f3d22]" />
          <p className="mb-1 text-[#39ff88]/60">Cálculo da comissão (mês corrente)</p>
          {filledBreakdown.map((b) => (
            <div key={b.name} className="flex justify-between">
              <span>
                {formatBRL(b.amountInTier)} × {formatPercent(b.percent)}
              </span>
              <span className="text-white">{formatBRL(b.commission)}</span>
            </div>
          ))}
          {tp.overrideCommission > 0 && (
            <div className="flex justify-between">
              <span>Comissão por produto com % próprio</span>
              <span className="text-white">{formatBRL(tp.overrideCommission)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#0f3d22] pt-1 font-semibold">
            <span className="text-[#39ff88]">TOTAL</span>
            <span className="text-[#39ff88]">{formatBRL(tp.totalCommission)}</span>
          </div>
        </>
      )}
    </div>
  );
}
