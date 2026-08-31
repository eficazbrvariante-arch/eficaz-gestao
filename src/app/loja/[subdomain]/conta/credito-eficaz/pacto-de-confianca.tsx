"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  HandshakeIcon,
  ChecklistIcon,
  ShieldLockIcon,
  CalendarIcon,
  StarIcon,
  TrendingUpIcon,
  CardIcon,
  ChevronRightIcon,
} from "../../icons";

export type PactoVariant = "novo" | "em_analise" | "aprovado" | "bloqueado";

const PRINCIPLES = [
  {
    icon: ShieldLockIcon,
    title: "Voto de confiança",
    text: "Você recebe um limite definido pela Eficaz.",
  },
  {
    icon: CalendarIcon,
    title: "Use quando precisar",
    text: "Para necessidades que não podem esperar.",
  },
  {
    icon: StarIcon,
    title: "Pague em dia",
    text: "Seus pagamentos constroem um histórico positivo.",
  },
  {
    icon: TrendingUpIcon,
    title: "Confiança que cresce",
    text: "Bom histórico pode trazer mais oportunidades.",
  },
];

/**
 * Camada de comunicação/conscientização sobre o Crédito Eficaz — não é
 * termo formal (aceite jurídico continua em `CreditoEficazSection`, sem
 * duplicação de formulário) e não muda nenhuma regra de concessão. Só
 * explica o programa antes do cliente decidir solicitar.
 */
export function PactoDeConfianca({
  variant,
  onRequest,
}: {
  variant: PactoVariant;
  /** Chamado só quando o compromisso já está marcado — abre o formulário
   *  real (`CreditoEficazSection`) direto, sem duplicar nada aqui. */
  onRequest: () => void;
}) {
  const [committed, setCommitted] = useState(false);

  if (variant !== "novo") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-slate-800 to-slate-900 p-4 shadow-[0_0_24px_-14px_rgba(16,185,129,0.5)]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-inner">
          <HandshakeIcon className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Crédito é confiança.</p>
          <p className="text-xs text-slate-400">Confiança recebida. Compromisso retribuído.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Manifesto */}
      <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-slate-800 to-slate-900 p-5 shadow-[0_0_32px_-16px_rgba(16,185,129,0.55)] sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-inner">
              <HandshakeIcon className="h-8 w-8 text-white drop-shadow-sm" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-white sm:text-xl">
                Crédito é <span className="text-emerald-400">confiança</span>.
                <br />E confiança se constrói <span className="text-emerald-400">dos dois lados</span>.
              </h1>
              <p className="mt-3 text-sm text-slate-300">
                O Crédito Eficaz foi criado para ajudar nossos clientes quando uma necessidade não
                pode esperar. Ao concedermos um limite, a Eficaz deposita em você um voto de
                confiança.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 border-t border-slate-700/60 pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <HandshakeIcon className="h-5 w-5 text-emerald-400" />
            </span>
            <div>
              <p className="text-sm text-slate-300">
                Quando você honra seu compromisso, essa confiança cresce — e ajuda este benefício a
                continuar existindo para mais pessoas.
              </p>
              <p className="mt-3 text-sm font-semibold text-emerald-400 underline underline-offset-2">
                Use com consciência.
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Assuma somente o que cabe no seu orçamento. E conte com a Eficaz quando precisar.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Meu compromisso com a Eficaz */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50">
            <ChecklistIcon className="h-5 w-5 text-emerald-600" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Meu compromisso com a Eficaz</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Entendo que o Crédito Eficaz é um voto de confiança e me comprometo a utilizá-lo com
              responsabilidade e cumprir os pagamentos nas datas combinadas.
            </p>
          </div>
        </div>

        <label className="flex shrink-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:max-w-[220px]">
          <Checkbox
            checked={committed}
            onChange={(e) => setCommitted(e.target.checked)}
            className="shrink-0"
            style={{ accentColor: "#059669" }}
          />
          Li, entendi e aceito meu compromisso com a Eficaz.
        </label>
      </div>

      {/* Quatro princípios */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="rounded-xl border border-slate-200 bg-white p-3">
            <p.icon className="h-5 w-5 text-emerald-600" />
            <p className="mt-2 text-xs font-semibold text-slate-900">{p.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{p.text}</p>
          </div>
        ))}
      </div>

      {/* Privacidade */}
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldLockIcon className="h-4 w-4 shrink-0 text-slate-400" />
        Suas informações são protegidas e seu limite é pessoal e intransferível.
      </p>

      {/* CTA — um clique só: já abre o formulário real logo abaixo. */}
      <button
        type="button"
        disabled={!committed}
        onClick={onRequest}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold tracking-wide text-white transition-all duration-200 motion-reduce:transition-none ${
          committed
            ? "cursor-pointer bg-emerald-600 hover:-translate-y-0.5 hover:bg-emerald-500 motion-reduce:hover:translate-y-0"
            : "cursor-not-allowed bg-slate-300"
        }`}
      >
        <CardIcon className="h-4 w-4" />
        QUERO SOLICITAR MEU CRÉDITO
        <ChevronRightIcon className="h-4 w-4" />
      </button>
      {!committed && (
        <p className="-mt-2 text-center text-xs text-slate-400">
          Marque o compromisso acima para continuar.
        </p>
      )}

      <p className="pt-2 text-center text-xs tracking-wide text-slate-400">
        Confiança recebida. Compromisso retribuído.
      </p>
    </div>
  );
}
