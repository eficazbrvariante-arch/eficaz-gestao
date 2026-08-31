export type ProgressStat = {
  key: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  value: string;
  label: string;
};

/**
 * Resumo real da relação do cliente com a loja — nunca XP, nível ou ranking
 * fictício (não existe hoje um sistema de gamificação por níveis; quando
 * existir, esta seção é o lugar preparado pra recebê-lo). Só mostra o que
 * já foi calculado a partir de dado real; um `stats` vazio não renderiza
 * nada.
 */
export function AccountProgressStrip({ stats }: { stats: ProgressStat[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-800 to-slate-900 p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-semibold text-white">Seu progresso Eficaz</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700/60">
              <stat.icon className="h-4 w-4 text-slate-200" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{stat.value}</p>
              <p className="truncate text-[11px] text-slate-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
