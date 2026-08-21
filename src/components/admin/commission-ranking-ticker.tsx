import { formatBRL } from "@/lib/format";
import type { CommissionRankingRow } from "@/modules/employees/commission-service";

const MEDAL_BY_RANK: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * Versão compacta do Ranking de Comissão pro topo do PDV — visível pra
 * qualquer perfil que opere o caixa, como incentivo do time. Rankeia por
 * valor de comissão em R$ (quem ganhou mais até agora), não pela comissão
 * efetiva em % (essa é a métrica da versão completa, restrita a
 * Admin/Gerente em `/colaboradores/ranking-comissao`) — e nunca mostra
 * quanto cada um vendeu, só quanto vai receber.
 */
export function CommissionRankingTicker({ rows }: { rows: CommissionRankingRow[] }) {
  if (rows.length === 0) return null;

  const ranked = [...rows].sort((a, b) => b.totalCommission - a.totalCommission);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-[#0f3d22] bg-[#020805] px-4 py-2.5 shadow-[0_0_30px_-15px_rgba(57,255,136,0.35)]">
      <div className="flex items-center gap-3 overflow-x-auto">
        <span className="shrink-0 font-mono text-[10px] tracking-widest text-[#39ff88]/60">
          &gt; comissão
        </span>
        {ranked.map((row, index) => {
          const rank = index + 1;
          return (
            <span
              key={row.userId}
              className="flex shrink-0 items-baseline gap-1.5 rounded-full border border-[#0f3d22] bg-[#03130a] px-3 py-1 font-mono text-xs"
            >
              <span className={rank <= 3 ? "text-[#39ff88]" : "text-[#39ff88]/50"}>
                {MEDAL_BY_RANK[rank] ?? String(rank).padStart(2, "0")}
              </span>
              <span className="font-semibold text-white">{row.userName}</span>
              <span
                className="font-bold text-[#39ff88]"
                style={{ textShadow: "0 0 8px rgba(57,255,136,0.6)" }}
              >
                {formatBRL(row.totalCommission)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
