"use client";

import { useState } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import type { CommissionRankingRow } from "@/modules/employees/commission-service";
import type { SellerTierProgress } from "@/modules/employees/commission-tier-service";
import type { Period } from "@/modules/reports/report-service";
import {
  formatPercent,
  TierBadge,
  TierProgressBar,
  TierIndicators,
  TierBreakdown,
} from "@/components/employees/tier-progress-ui";

const MEDAL_BY_RANK: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export type RankingComissaoRow = CommissionRankingRow & { tierProgress: SellerTierProgress | null };

function SellerDetailCard({ row }: { row: RankingComissaoRow }) {
  const tp = row.tierProgress;

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
          <div className="flex justify-between font-mono text-xs text-[#39ff88]/80">
            <span>Faixa atual</span>
            <span className="text-white">
              {tp.currentTier.name} · {formatPercent(tp.currentTier.percent)}
            </span>
          </div>
          <div className="mt-1">
            <TierBreakdown tierProgress={tp} />
          </div>
        </>
      )}
    </div>
  );
}

function SellerRow({ row, rank, period }: { row: RankingComissaoRow; rank: number; period: Period }) {
  const [open, setOpen] = useState(false);
  const isTop = rank <= 3;
  const tp = row.tierProgress;

  return (
    <li className="group relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
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
        {tp && <TierBadge tierProgress={tp} />}
      </div>

      {/* Botão de toque (mobile/tablet) — hover já cobre desktop via onMouseEnter/Leave do <li>. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left"
        aria-expanded={open}
        aria-label={`Ver detalhamento de ${row.userName}`}
      >
        {tp && <TierProgressBar tierProgress={tp} />}
      </button>

      {tp ? (
        <div className="mt-2">
          <TierIndicators tierProgress={tp} />
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
    <div className="relative rounded-xl border border-[#0f3d22] bg-[#020805] p-5 shadow-[0_0_40px_-15px_rgba(57,255,136,0.35)] sm:p-8">
      {/* `overflow-hidden` fica só aqui, isolado — se estivesse no container
          de fora (como antes), cortava o card flutuante de detalhamento
          (`SellerDetailCard`) sempre que ele "vazava" pra fora da caixa ao
          passar o mouse perto da borda/fim da lista. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        {/* Chuva de código decorativa, só textura — não carrega nenhum dado */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #39ff88 0, #39ff88 1px, transparent 1px, transparent 22px)",
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
      </div>

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
