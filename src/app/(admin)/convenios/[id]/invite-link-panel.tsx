"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { getOrCreateConvenioInviteAction, revokeConvenioInviteAction } from "../actions";

export type ActiveInvite = {
  id: string;
  createdAt: Date;
  createdByName: string;
  /** Nulo só para convites antigos, gerados antes de o link passar a ficar salvo. */
  url: string | null;
};

/**
 * O link do convite ativo fica salvo (`ConvenioInvite.token`) e volta toda
 * vez que a tela é aberta — não precisa gerar de novo só porque perdeu a
 * aba. "Gerar novo link" continua disponível para trocar quando quiser
 * (revoga o atual automaticamente).
 */
export function InviteLinkPanel({
  convenioId,
  activeInvite,
}: {
  convenioId: string;
  activeInvite: ActiveInvite | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const displayUrl = freshUrl ?? activeInvite?.url ?? null;

  function handleGenerate() {
    setFeedback(undefined);
    setCopied(false);
    startTransition(async () => {
      const result = await getOrCreateConvenioInviteAction(convenioId);
      if (!result || result.error || !result.url) {
        setFeedback({ type: "error", message: result?.error ?? "Não foi possível gerar o link." });
        return;
      }
      setFreshUrl(result.url);
      router.refresh();
    });
  }

  function handleRevoke() {
    if (!activeInvite) return;
    setFeedback(undefined);
    startTransition(async () => {
      const result = await revokeConvenioInviteAction(activeInvite.id);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFreshUrl(null);
      setCopied(false);
      setFeedback({ type: "success", message: result?.success ?? "Link revogado." });
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
    } catch {
      setFeedback({ type: "error", message: "Não foi possível copiar — selecione e copie manualmente." });
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-sm font-semibold text-slate-900">Link de cadastro</p>
      <p className="mb-3 text-xs text-slate-500">
        Compartilhe este link com o responsável da empresa parceira, pra ela repassar aos próprios
        colaboradores — o cadastro é sempre preenchido pela pessoa, nunca pela EficazBr.
      </p>

      <FormBanner message={feedback?.message} variant={feedback?.type} />

      {displayUrl && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-2 text-xs font-medium text-emerald-800">
            {freshUrl || !activeInvite
              ? "Novo link gerado."
              : `Link ativo, gerado em ${formatDateTime(activeInvite.createdAt)} por ${activeInvite.createdByName}.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-slate-700">
              {displayUrl}
            </code>
            <Button type="button" variant="secondary" fullWidth={false} onClick={handleCopy}>
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      {activeInvite && !activeInvite.url && !freshUrl && (
        <p className="mb-3 text-sm text-slate-600">
          Link ativo, gerado em {formatDateTime(activeInvite.createdAt)} por{" "}
          {activeInvite.createdByName} — gerado antes desta tela passar a guardar o link, então não
          dá mais para reexibir. Gere um novo para poder copiar.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isPending} fullWidth={false} onClick={handleGenerate}>
          {activeInvite ? "Gerar novo link" : "Gerar link"}
        </Button>
        {activeInvite && (
          <Button type="button" variant="secondary" disabled={isPending} fullWidth={false} onClick={handleRevoke}>
            Revogar link
          </Button>
        )}
      </div>
      {activeInvite && (
        <p className="mt-2 text-xs text-slate-400">
          Gerar um link novo revoga automaticamente o atual — quem já tinha o antigo não consegue
          mais se cadastrar por ele.
        </p>
      )}
    </div>
  );
}
