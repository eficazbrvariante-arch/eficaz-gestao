import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

/** Vocabulário fixo de status dos cards da Central do Cliente — nunca usar rótulo livre. */
export type AccountCardStatus =
  | "NOVO"
  | "ATIVO"
  | "EM_ANALISE"
  | "PENDENTE"
  | "DISPONIVEL"
  | "BLOQUEADO"
  | "ACAO_NECESSARIA";

const STATUS_LABEL: Record<AccountCardStatus, string> = {
  NOVO: "Novo",
  ATIVO: "Ativo",
  EM_ANALISE: "Em análise",
  PENDENTE: "Pendente",
  DISPONIVEL: "Disponível",
  BLOQUEADO: "Bloqueado",
  ACAO_NECESSARIA: "Ação necessária",
};

/** Vermelho fica só pra bloqueio/ação necessária — nunca pra estado normal. */
const STATUS_VARIANT: Record<AccountCardStatus, BadgeVariant> = {
  NOVO: "info",
  ATIVO: "success",
  EM_ANALISE: "warning",
  PENDENTE: "warning",
  DISPONIVEL: "success",
  BLOQUEADO: "danger",
  ACAO_NECESSARIA: "danger",
};

export type AccountCardTone = "credit" | "protection" | "purchases" | "fiado" | "benefits" | "neutral";

/** Cor discreta por categoria — só no círculo do ícone, nunca no cartão inteiro. */
const TONE_CLASSES: Record<AccountCardTone, string> = {
  credit: "bg-amber-50 text-amber-700",
  protection: "bg-emerald-50 text-emerald-700",
  purchases: "bg-blue-50 text-blue-700",
  fiado: "bg-teal-50 text-teal-700",
  benefits: "bg-violet-50 text-violet-700",
  neutral: "bg-slate-100 text-slate-600",
};

export function AccountFeatureCard({
  icon: Icon,
  title,
  description,
  href,
  tone,
  status,
  value,
  badge,
}: {
  icon: (props: { className?: string }) => React.JSX.Element;
  title: string;
  description: string;
  href: string;
  tone: AccountCardTone;
  /** Estado do vocabulário fixo (ver `AccountCardStatus`) — opcional. */
  status?: AccountCardStatus;
  /** Indicador real (ex.: "R$ 220 disponível") — nunca um número inventado. */
  value?: string;
  /** Contador simples opcional (ex.: "12") — mostrado como selo discreto perto do título. */
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border-active hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        {status && <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-muted">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        {value && <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>}
      </div>
    </Link>
  );
}
