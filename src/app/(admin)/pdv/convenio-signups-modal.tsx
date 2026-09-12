"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/ui/form-banner";
import { formatDateTime } from "@/lib/format";
import { listConvenioSignupReviewAction, reviewConvenioSignupAction } from "./actions";
import type {
  ConvenioSignupLink,
  PendingConvenioMember,
} from "@/modules/convenios/convenio-member-review-service";

type Feedback = { type: "success" | "error"; message: string };

/**
 * "Cadastros de convênio" no PDV (pedido do dono): qualquer vendedor aprova
 * ou recusa quem se cadastrou pelo link, de qualquer convênio, conferindo a
 * selfie e o comprovante — e copia o link de cadastro ativo pra repassar ao
 * próximo colaborador. Gerar/revogar link continua em Convênios (Admin/Gerente).
 */
export function ConvenioSignupsModal({
  open,
  onClose,
  onReviewed,
}: {
  open: boolean;
  onClose: () => void;
  /** Depois de cada decisão — o PDV atualiza o contador de pendentes. */
  onReviewed: () => void;
}) {
  const [pending, setPending] = useState<PendingConvenioMember[]>([]);
  const [links, setLinks] = useState<ConvenioSignupLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const result = await listConvenioSignupReviewAction();
      if ("error" in result) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setPending(result.pending);
      setLinks(result.links);
      setLoaded(true);
    });
  }

  useEffect(() => {
    if (!open) return;
    // Dentro do timeout (nunca sincronamente no corpo do efeito), mesmo
    // padrão de `ConvenioModal`.
    const timeout = window.setTimeout(() => {
      setFeedback(undefined);
      setRejectingId(null);
      setRejectReason("");
      setCopiedId(null);
      load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  function decide(memberId: string, decision: "APPROVE" | "REJECT") {
    setFeedback(undefined);
    if (decision === "REJECT" && !rejectReason.trim()) {
      setFeedback({ type: "error", message: "Informe o motivo da recusa." });
      return;
    }
    startTransition(async () => {
      const result = await reviewConvenioSignupAction(
        memberId,
        decision,
        decision === "REJECT" ? rejectReason : undefined
      );
      if ("error" in result) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result.success });
        setRejectingId(null);
        setRejectReason("");
      }
      // Sempre recarrega: com sucesso some da lista; com "já analisado por
      // outra pessoa", some também — nunca fica um cadastro velho na tela.
      onReviewed();
      const refreshed = await listConvenioSignupReviewAction();
      if (!("error" in refreshed)) {
        setPending(refreshed.pending);
        setLinks(refreshed.links);
      }
    });
  }

  async function copyLink(link: ConvenioSignupLink) {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.convenioId);
    } catch {
      setFeedback({ type: "error", message: "Não foi possível copiar — selecione o link e copie manualmente." });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cadastros de convênio"
      description="Confira a selfie e o comprovante antes de aprovar. Aprovado, o QR da pessoa já vale no caixa."
      className="max-w-2xl"
    >
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-bold text-foreground">
          Aguardando aprovação{loaded ? ` (${pending.length})` : ""}
        </h3>
        {!loaded && <p className="text-sm text-text-muted">Carregando...</p>}
        {loaded && pending.length === 0 && (
          <p className="text-sm text-text-muted">Nenhum cadastro aguardando aprovação.</p>
        )}
        <ul className="space-y-3">
          {pending.map((member) => (
            <li key={member.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap gap-3">
                <a href={member.selfieUrl} target="_blank" rel="noopener noreferrer" title="Abrir selfie">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto enviada pelo colaborador, domínio do Blob */}
                  <img
                    src={member.selfieUrl}
                    alt={`Selfie de ${member.name}`}
                    className="h-24 w-24 rounded-md border border-border object-cover"
                  />
                </a>
                {member.proofUrl && (
                  <a href={member.proofUrl} target="_blank" rel="noopener noreferrer" title="Abrir comprovante">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto enviada pelo colaborador, domínio do Blob */}
                    <img
                      src={member.proofUrl}
                      alt={`Comprovante de ${member.name}`}
                      className="h-24 w-24 rounded-md border border-border object-cover"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold text-foreground">{member.name}</p>
                  <p className="text-text-secondary">Convênio {member.convenioName}</p>
                  <p className="text-xs text-text-muted">CPF {member.documentMasked}</p>
                  {member.phone && <p className="text-xs text-text-muted">Tel. {member.phone}</p>}
                  <p className="text-xs text-text-muted">Cadastrado em {formatDateTime(member.createdAt)}</p>
                  {!member.proofUrl && <p className="text-xs text-text-muted">Sem comprovante enviado.</p>}
                </div>
              </div>

              {rejectingId === member.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Motivo da recusa (ex.: foto não confere, não trabalha na empresa)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      fullWidth={false}
                      disabled={isPending}
                      onClick={() => decide(member.id, "REJECT")}
                    >
                      Confirmar recusa
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth={false}
                      disabled={isPending}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                    >
                      Voltar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    fullWidth={false}
                    disabled={isPending}
                    onClick={() => decide(member.id, "APPROVE")}
                  >
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    disabled={isPending}
                    onClick={() => {
                      setFeedback(undefined);
                      setRejectReason("");
                      setRejectingId(member.id);
                    }}
                  >
                    Recusar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold text-foreground">Links de cadastro</h3>
        <p className="mb-2 text-xs text-text-muted">
          Copie e mande pro próximo colaborador se cadastrar. Quando um link novo é gerado em Convênios, ele
          aparece aqui sozinho.
        </p>
        {loaded && links.length === 0 && <p className="text-sm text-text-muted">Nenhum convênio ativo.</p>}
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.convenioId} className="rounded-lg border border-border p-3">
              <p className="mb-1 text-sm font-bold text-foreground">{link.convenioName}</p>
              {link.url ? (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-surface-hover px-2 py-1.5 text-xs text-text-secondary">
                    {link.url}
                  </code>
                  <Button type="button" variant="secondary" fullWidth={false} onClick={() => copyLink(link)}>
                    {copiedId === link.convenioId ? "Copiado!" : "Copiar"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  Sem link de cadastro ativo — peça ao Admin ou Gerente pra gerar um em Convênios.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </Dialog>
  );
}
