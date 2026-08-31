import Link from "next/link";
import { ChevronRightIcon } from "../icons";

/** Vocabulário fixo de status dos cards da Central do Cliente — nunca usar rótulo livre. */
export type AccountCardStatus =
  | "NOVO"
  | "ATIVO"
  | "EM_ANALISE"
  | "PENDENTE"
  | "DISPONIVEL"
  | "BLOQUEADO"
  | "ACAO_NECESSARIA";

export type AccountCardTone = "credit" | "protection" | "purchases" | "fiado" | "benefits" | "neutral";

type ToneStyle = {
  border: string;
  glow: string;
  glowHover: string;
  iconGradient: string;
  pillBg: string;
  pillText: string;
  accent: string;
  chevronBorder: string;
};

/** Cor discreta por categoria — concentrada no ícone/borda/glow/badge/detalhe
 *  inferior; o corpo do card permanece escuro/neutro nos seis. */
const TONE_STYLES: Record<AccountCardTone, ToneStyle> = {
  protection: {
    border: "border-emerald-500/25",
    glow: "shadow-[0_0_28px_-14px_rgba(16,185,129,0.55)]",
    glowHover: "hover:shadow-[0_0_34px_-10px_rgba(16,185,129,0.6)]",
    iconGradient: "from-emerald-400 to-emerald-600",
    pillBg: "bg-emerald-500/15",
    pillText: "text-emerald-300",
    accent: "bg-emerald-500",
    chevronBorder: "border-emerald-500/40 group-hover:border-emerald-400",
  },
  credit: {
    border: "border-amber-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(245,158,11,0.55)]",
    glowHover: "hover:shadow-[0_0_34px_-10px_rgba(245,158,11,0.6)]",
    iconGradient: "from-amber-300 to-amber-600",
    pillBg: "bg-amber-500/15",
    pillText: "text-amber-300",
    accent: "bg-amber-400",
    chevronBorder: "border-amber-400/40 group-hover:border-amber-300",
  },
  fiado: {
    border: "border-teal-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(45,212,191,0.55)]",
    glowHover: "hover:shadow-[0_0_34px_-10px_rgba(45,212,191,0.6)]",
    iconGradient: "from-teal-300 to-teal-600",
    pillBg: "bg-teal-500/15",
    pillText: "text-teal-300",
    accent: "bg-teal-400",
    chevronBorder: "border-teal-400/40 group-hover:border-teal-300",
  },
  purchases: {
    border: "border-blue-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(59,130,246,0.55)]",
    glowHover: "hover:shadow-[0_0_34px_-10px_rgba(59,130,246,0.6)]",
    iconGradient: "from-blue-400 to-blue-600",
    pillBg: "bg-blue-500/15",
    pillText: "text-blue-300",
    accent: "bg-blue-500",
    chevronBorder: "border-blue-400/40 group-hover:border-blue-300",
  },
  benefits: {
    border: "border-violet-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(167,139,250,0.55)]",
    glowHover: "hover:shadow-[0_0_34px_-10px_rgba(167,139,250,0.6)]",
    iconGradient: "from-violet-400 to-violet-600",
    pillBg: "bg-violet-500/15",
    pillText: "text-violet-300",
    accent: "bg-violet-400",
    chevronBorder: "border-violet-400/40 group-hover:border-violet-300",
  },
  neutral: {
    border: "border-slate-400/20",
    glow: "shadow-[0_0_22px_-14px_rgba(148,163,184,0.45)]",
    glowHover: "hover:shadow-[0_0_28px_-10px_rgba(148,163,184,0.5)]",
    iconGradient: "from-slate-300 to-slate-500",
    pillBg: "bg-slate-500/15",
    pillText: "text-slate-300",
    accent: "bg-slate-400",
    chevronBorder: "border-slate-400/30 group-hover:border-slate-300",
  },
};

/** Pílulas de estado semântico — sempre a mesma cor, independente do tom do
 *  card: vermelho fica reservado só pra bloqueio/ação necessária, âmbar pra
 *  análise/pendência, nunca a cor "de marca" da categoria nesses casos. */
const STATUS_OVERRIDE: Partial<Record<AccountCardStatus, { pillBg: string; pillText: string }>> = {
  BLOQUEADO: { pillBg: "bg-red-500/15", pillText: "text-red-300" },
  ACAO_NECESSARIA: { pillBg: "bg-red-500/15", pillText: "text-red-300" },
  EM_ANALISE: { pillBg: "bg-amber-500/15", pillText: "text-amber-300" },
  PENDENTE: { pillBg: "bg-amber-500/15", pillText: "text-amber-300" },
};

export function AccountFeatureCard({
  icon: Icon,
  title,
  description,
  href,
  tone,
  status,
  pill,
}: {
  icon: (props: { className?: string }) => React.JSX.Element;
  title: string;
  description: string;
  href: string;
  tone: AccountCardTone;
  /** Estado do vocabulário fixo (ver `AccountCardStatus`) — só define a cor da pílula quando for um estado de atenção (análise/bloqueio); fora isso, a pílula usa a cor da categoria. */
  status?: AccountCardStatus;
  /** Texto já pronto da pílula (ex.: "1 ATIVA", "R$ 220,00 DISPONÍVEL", "SOLICITAR CRÉDITO") — sempre dado real, nunca inventado. */
  pill?: string;
}) {
  const t = TONE_STYLES[tone];
  const pillColors = (status && STATUS_OVERRIDE[status]) || { pillBg: t.pillBg, pillText: t.pillText };

  return (
    <Link
      href={href}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border ${t.border} bg-gradient-to-b from-slate-800 to-slate-900 p-4 transition-all duration-200 ${t.glow} ${t.glowHover} hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${t.iconGradient} shadow-inner transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
        >
          <Icon className="h-7 w-7 text-white drop-shadow-sm" />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-sm font-semibold text-white sm:text-base">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">{description}</p>
        </div>

        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${t.chevronBorder} text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white motion-reduce:transition-none motion-reduce:group-hover:translate-x-0`}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </span>
      </div>

      {pill && (
        <span
          className={`mt-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${pillColors.pillBg} ${pillColors.pillText}`}
        >
          {pill}
        </span>
      )}

      <span className={`absolute inset-x-0 bottom-0 h-[3px] ${t.accent} opacity-80`} aria-hidden="true" />
    </Link>
  );
}
