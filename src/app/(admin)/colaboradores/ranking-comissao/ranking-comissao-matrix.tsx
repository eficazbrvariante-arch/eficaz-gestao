import { formatBRL } from "@/lib/format";
import type { CommissionRankingRow } from "@/modules/employees/commission-service";

const MEDAL_BY_RANK: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function RankingComissaoMatrix({ rows }: { rows: CommissionRankingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Nenhum vendedor com venda concluída no período — o ranking aparece assim que a primeira
        venda for fechada.
      </div>
    );
  }

  const maxPercent = Math.max(...rows.map((row) => row.percent), 0.01);

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
          &gt; ranking_comissao --ordenar=desc
        </p>

        <ul className="flex flex-col gap-5">
          {rows.map((row, index) => {
            const rank = index + 1;
            const barWidth = Math.max((row.percent / maxPercent) * 100, 4);
            const isTop = rank <= 3;

            return (
              <li key={row.userId} className="group">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 font-mono">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={
                        isTop
                          ? "text-sm text-[#39ff88]"
                          : "text-sm text-[#39ff88]/50"
                      }
                    >
                      {String(rank).padStart(2, "0")}
                      {MEDAL_BY_RANK[rank] ? ` ${MEDAL_BY_RANK[rank]}` : ""}
                    </span>
                    <span className="truncate text-sm font-semibold text-white">
                      {row.userName}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-base font-bold text-[#39ff88]"
                    style={{ textShadow: "0 0 10px rgba(57,255,136,0.65)" }}
                  >
                    {row.percent.toFixed(1)}%
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#0a1a10]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0f5c2e] to-[#39ff88] transition-[width] duration-500"
                    style={{
                      width: `${barWidth}%`,
                      boxShadow: "0 0 12px rgba(57,255,136,0.55)",
                    }}
                  />
                </div>

                <p className="mt-1 font-mono text-[11px] text-[#39ff88]/40">
                  {formatBRL(row.totalCommission)} de comissão em {formatBRL(row.totalSales)} vendidos
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
