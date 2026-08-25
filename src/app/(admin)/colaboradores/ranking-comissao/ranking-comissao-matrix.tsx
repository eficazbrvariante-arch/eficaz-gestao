"use client";

import { useState } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import type { CommissionRankingRow } from "@/modules/employees/commission-service";
import type { SellerTierProgress } from "@/modules/employees/commission-tier-service";
import type { Period } from "@/modules/reports/report-service";

const MEDAL_BY_RANK: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export type RankingComissaoRow = CommissionRankingRow & { tierProgress: SellerTierProgress | null };

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/**
 * Laranja (início) → verde intermediário → verde forte (meta) — uma única
 * interpolação contínua, não blocos fixos, pra ficar elegante/premium em vez
 * de chamativo. `fraction` é 0..1 (quanto já andou até a faixa mais alta). O
 * verde forte é o `#39ff88` do tema Matrix, pra fechar exatamente na cor de
 * destaque já usada no resto do painel.
 */
function tierProgressColor(fraction: number) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const orange: [number, number, number] = [249, 115, 22];
  const midGreen: [number, number, number] = [74, 222, 128];
  const strongGreen: [number, number, number] = [57, 255, 136];
  const [from, to, t] =
    clamped < 0.5 ? [orange, midGreen, clamped / 0.5] : [midGreen, strongGreen, (clamped - 0.5) / 0.5];
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(from[0], to[0])}, ${lerp(from[1], to[1])}, ${lerp(from[2], to[2])})`;
}

function SellerDetailCard({ row }: { row: RankingComissaoRow; }) {
  const tp = row.tierProgress;
  const filledBreakdown = tp?.breakdown.filter((b) => b.amountInTier > 0) ?? [];

  return (
    <div
      className="absolute left-0 right-0 top-full z-10 mt-2 rounded-lg border border-[#0f3d22] bg-[#03110a] p-4 font-mono text-xs text-[#c9ffe0] shadow-[0_0_30px_-8px_rgba(57,255,136,0.5)]"
      // Evita fechar o card ao mover o mouse pra dentro dele (ele fica logo
      // abaixo da linha, dentro da mesma área de hover do <li>).
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-sm font-semibold text-white">{row.userName}</p>
      <div className="space-y-1 text-[#39ff88]/80">
        <div className="flex justify-between">
          <span>Vendas no período selecionado</span>
          <span className="text-white">{formatBRL(row.totalSales)}</span>
        </div>
        <div className="flex justify-between">
          <span>Comissão efetiva no período</span>
          <span className="text-white">
            {formatBRL(row.totalCommission)} ({formatPercent(row.percent)})
          </span>
        </div>
      </div>

      {tp && (
        <>
          <div className="my-3 border-t border-[#0f3d22]" />
          <p className="mb-1 text-[#39ff88]/60">Faixa · mês corrente</p>
          <div className="space-y-1 text-[#39ff88]/80">
            <div className="flex justify-between">
              <span>Faixa atual</span>
              <span className="text-white">
                {tp.currentTier.name} · {formatPercent(tp.currentTier.percent)}
              </span>
            </div>
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
          </div>

          {filledBreakdown.length > 0 && (
            <>
              <div className="my-3 border-t border-[#0f3d22]" />
              <p className="mb-1 text-[#39ff88]/60">Cálculo da comissão (mês corrente)</p>
              <div className="space-y-0.5 text-[#39ff88]/80">
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
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SellerRow({ row, rank, period }: { row: RankingComissaoRow; rank: number; period: Period }) {
  const [open, setOpen] = useState(false);
  const isTop = rank <= 3;
  const tp = row.tierProgress;
  const hasMultipleTiers = (tp?.breakdown.length ?? 0) > 1;
  const topThreshold = hasMultipleTiers ? tp!.breakdown[tp!.breakdown.length - 1].minAmount : 0;
  const fraction = hasMultipleTiers && topThreshold > 0 ? Math.min(1, tp!.tierEligibleSales / topThreshold) : 1;
  const barColor = tierProgressColor(fraction);

  return (
    <li
      className="group relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3 font-mono">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={isTop ? "text-sm text-[#39ff88]" : "text-sm text-[#39ff88]/50"}>
            {String(rank).padStart(2, "0")}
            {MEDAL_BY_RANK[rank] ? ` ${MEDAL_BY_RANK[rank]}` : ""}
          </span>
          <Link
            href={`/colaboradores/${row.userId}/comissao?de=${period.from}&ate=${period.to}`}
            onClick={(e) => e.stopPropagation()}
            className="truncate text-sm font-semibold text-white underline-offset-2 hover:text-[#39ff88] hover:underline"
          >
            {row.userName}
          </Link>
        </span>
        {tp && (
          <span
            className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-wide"
            style={{ color: barColor, textShadow: `0 0 8px ${barColor}` }}
          >
            {tp.currentTier.name} · {formatPercent(tp.currentTier.percent)}
          </span>
        )}
      </div>

      {/* Botão de toque (mobile/tablet) — hover já cobre desktop via onMouseEnter/Leave do <li>. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left"
        aria-expanded={open}
        aria-label={`Ver detalhamento de ${row.userName}`}
      >
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#0a1a10]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${fraction * 100}%`,
              background: barColor,
              boxShadow: `0 0 12px ${barColor}`,
            }}
          />
          {hasMultipleTiers &&
            tp!.breakdown.map((b) => (
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
            {tp!.breakdown.map((b) => (
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
      </button>

      {tp ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-wide text-[#39ff88]/50">Comissão</p>
            <p className="font-mono text-xs font-semibold text-[#39ff88]">{formatBRL(tp.totalCommission)}</p>
          </div>
          <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-wide text-[#39ff88]/50">Vendido</p>
            <p className="font-mono text-xs font-semibold" style={{ color: barColor }}>
              {formatBRL(tp.totalSales)}
            </p>
          </div>
          {hasMultipleTiers && tp.nextTier ? (
            <div className="rounded-md bg-[#0a1a10] px-2 py-1.5">
              <p className="font-mono text-[9px] uppercase tracking-wide text-[#f0b429]/70">
                Falta p/ {tp.nextTier.name}
              </p>
              <p className="font-mono text-xs font-semibold text-[#f0b429]">
                {formatBRL(tp.amountToNextTier ?? 0)}
              </p>
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
      ) : (
        <p className="mt-1 font-mono text-[11px] text-[#39ff88]/40">
          {formatBRL(row.totalCommission)} de comissão em {formatBRL(row.totalSales)} vendidos
        </p>
      )}

      {open && <SellerDetailCard row={row} />}
    </li>
  );
}

export function RankingComissaoMatrix({
  rows,
  period,
}: {
  rows: RankingComissaoRow[];
  period: Period;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Nenhum vendedor com venda concluída nesse período ainda.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#0f3d22] bg-[#020805] p-5 shadow-[0_0_40px_-15px_rgba(57,255,136,0.35)] sm:p-8">
      {/* Chuva de código decorativa, só textura — não carrega nenhum dado */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #39ff88 0, #39ff88 1px, transparent 1px, transparent 22px)",
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      <div className="relative">
        <p className="mb-6 font-mono text-xs tracking-widest text-[#39ff88]/70">
          &gt; ranking_comissao --de={period.from} --ate={period.to} --ordenar=desc
        </p>

        <ul className="flex flex-col gap-6">
          {rows.map((row, index) => (
            <SellerRow key={row.userId} row={row} rank={index + 1} period={period} />
          ))}
        </ul>
      </div>
    </div>
  );
}
