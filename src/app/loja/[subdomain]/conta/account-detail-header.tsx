import Link from "next/link";
import { ChevronRightIcon } from "../icons";
import type { AccountCardTone } from "./account-feature-card";

type ToneHeaderStyle = { border: string; glow: string; iconGradient: string };

/** Mesma paleta por categoria dos cards do hub — a página de detalhe abre
 *  com o cabeçalho no tom certo pra não quebrar a continuidade visual. */
const TONE_HEADER_STYLES: Record<AccountCardTone, ToneHeaderStyle> = {
  protection: {
    border: "border-emerald-500/25",
    glow: "shadow-[0_0_28px_-14px_rgba(16,185,129,0.55)]",
    iconGradient: "from-emerald-400 to-emerald-600",
  },
  credit: {
    border: "border-amber-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(245,158,11,0.55)]",
    iconGradient: "from-amber-300 to-amber-600",
  },
  fiado: {
    border: "border-teal-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(45,212,191,0.55)]",
    iconGradient: "from-teal-300 to-teal-600",
  },
  purchases: {
    border: "border-blue-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(59,130,246,0.55)]",
    iconGradient: "from-blue-400 to-blue-600",
  },
  benefits: {
    border: "border-violet-400/25",
    glow: "shadow-[0_0_28px_-14px_rgba(167,139,250,0.55)]",
    iconGradient: "from-violet-400 to-violet-600",
  },
  neutral: {
    border: "border-slate-400/20",
    glow: "shadow-[0_0_22px_-14px_rgba(148,163,184,0.45)]",
    iconGradient: "from-slate-300 to-slate-500",
  },
};

export function AccountDetailHeader({
  icon: Icon,
  title,
  description,
  tone,
  base,
}: {
  icon: (props: { className?: string }) => React.JSX.Element;
  title: string;
  description: string;
  tone: AccountCardTone;
  base: string;
}) {
  const t = TONE_HEADER_STYLES[tone];

  return (
    <div className={`mb-6 overflow-hidden rounded-2xl border ${t.border} bg-gradient-to-b from-slate-800 to-slate-900 p-4 ${t.glow} sm:p-5`}>
      <Link
        href={`${base}/conta`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-180" />
        Voltar para Minha Conta
      </Link>

      <div className="flex items-center gap-3">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${t.iconGradient} shadow-inner`}
        >
          <Icon className="h-7 w-7 text-white drop-shadow-sm" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white sm:text-lg">{title}</h1>
          <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">{description}</p>
        </div>
      </div>
    </div>
  );
}
