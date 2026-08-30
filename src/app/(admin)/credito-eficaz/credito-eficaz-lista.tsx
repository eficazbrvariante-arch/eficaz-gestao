"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL, formatDateTime } from "@/lib/format";
import { approveApplicationAction, rejectApplicationAction, requestApplicationInfoAction } from "./actions";
import type { listApplicationsForAdmin } from "@/modules/credito-eficaz/credito-eficaz-service";

type ApplicationRow = Awaited<ReturnType<typeof listApplicationsForAdmin>>[number];

const STATUS_BADGE = {
  DRAFT: "neutral",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  INFO_REQUESTED: "info",
  REJECTED: "danger",
  BLOCKED: "danger",
} as const;

const STATUS_LABEL = {
  DRAFT: "Rascunho",
  UNDER_REVIEW: "Em análise",
  APPROVED: "Aprovado",
  INFO_REQUESTED: "Informação pendente",
  REJECTED: "Recusado",
  BLOCKED: "Bloqueado",
} as const;

const DOCUMENT_LABEL = {
  ID_DOCUMENT: "Documento de identificação",
  RESIDENCE_PROOF: "Comprovante de residência",
  SELFIE: "Selfie de confirmação",
} as const;

const PENDING_DECISION = new Set(["UNDER_REVIEW", "INFO_REQUESTED"]);

export function CreditoEficazLista({ applications }: { applications: ApplicationRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [approveTarget, setApproveTarget] = useState<ApplicationRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApplicationRow | null>(null);
  const [infoTarget, setInfoTarget] = useState<ApplicationRow | null>(null);
  const [limitAmount, setLimitAmount] = useState("");
  const [note, setNote] = useState("");

  function runAction(promise: Promise<{ error?: string; success?: string }>) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await promise;
      setFeedback(
        result.error ? { type: "error", message: result.error } : { type: "success", message: result.success! }
      );
      router.refresh();
    });
  }

  function confirmApprove() {
    if (!approveTarget) return;
    runAction(approveApplicationAction(approveTarget.id, { limitAmount: Number(limitAmount), note }));
    setApproveTarget(null);
  }

  function confirmReject() {
    if (!rejectTarget) return;
    runAction(rejectApplicationAction(rejectTarget.id, { reason: note }));
    setRejectTarget(null);
  }

  function confirmRequestInfo() {
    if (!infoTarget) return;
    runAction(requestApplicationInfoAction(infoTarget.id, { note }));
    setInfoTarget(null);
  }

  const relevant = applications.filter((app) => app.status !== "DRAFT");

  if (relevant.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
        Nenhuma solicitação de Crédito Eficaz enviada ainda.
      </div>
    );
  }

  return (
    <div>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="space-y-4">
        {relevant.map((app) => (
          <div key={app.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link href={`/clientes/${app.customer.id}`} className="font-medium text-slate-900 hover:underline">
                  {app.customer.name}
                </Link>
                {app.customer.eficazNumber && (
                  <span className="ml-2 text-xs text-slate-400">{app.customer.eficazNumber}</span>
                )}
                {app.customer.phone && <span className="ml-2 text-xs text-slate-400">{app.customer.phone}</span>}
                {app.submittedAt && (
                  <span className="ml-2 text-xs text-slate-400">Enviado em {formatDateTime(app.submittedAt)}</span>
                )}
              </div>
              <Badge variant={STATUS_BADGE[app.status]}>{STATUS_LABEL[app.status]}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                <p>
                  <span className="text-xs text-slate-500">Ocupação:</span> {app.occupation || "—"}
                </p>
                <p>
                  <span className="text-xs text-slate-500">Renda informada:</span>{" "}
                  {app.income != null ? formatBRL(Number(app.income)) : "—"}
                </p>
                <p>
                  <span className="text-xs text-slate-500">Melhor dia de vencimento:</span>{" "}
                  {app.bestDueDay ?? "—"}
                </p>
                {app.additionalNotes && (
                  <p className="mt-1">
                    <span className="text-xs text-slate-500">Observação:</span> {app.additionalNotes}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">Documentos</p>
                <div className="grid grid-cols-3 gap-2">
                  {app.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={`/api/credito-eficaz/documentos/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={DOCUMENT_LABEL[doc.type]}
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada, não é imagem otimizável */}
                      <img
                        src={`/api/credito-eficaz/documentos/${doc.id}`}
                        alt={DOCUMENT_LABEL[doc.type]}
                        className="h-20 w-full rounded-md border border-slate-200 object-cover"
                      />
                      <p className="mt-1 text-center text-[10px] text-slate-500">{DOCUMENT_LABEL[doc.type]}</p>
                    </a>
                  ))}
                  {app.documents.length === 0 && (
                    <p className="col-span-3 text-xs text-slate-400">Nenhum documento enviado.</p>
                  )}
                </div>
              </div>
            </div>

            {PENDING_DECISION.has(app.status) && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  fullWidth={false}
                  disabled={isPending}
                  onClick={() => {
                    setApproveTarget(app);
                    setLimitAmount("");
                    setNote("");
                  }}
                  className="px-4"
                >
                  Aprovar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  disabled={isPending}
                  onClick={() => {
                    setRejectTarget(app);
                    setNote("");
                  }}
                  className="px-4"
                >
                  Recusar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  disabled={isPending}
                  onClick={() => {
                    setInfoTarget(app);
                    setNote("");
                  }}
                  className="px-4"
                >
                  Pedir informação
                </Button>
              </div>
            )}

            {app.status === "APPROVED" && (
              <p className="mt-3 text-sm text-emerald-700">
                Aprovado com limite de {app.approvedLimitAmount ? formatBRL(Number(app.approvedLimitAmount)) : "—"}.
                Gestão de limite/bloqueio/pagamento na{" "}
                <Link href={`/clientes/${app.customer.id}`} className="underline">
                  ficha do cliente
                </Link>
                .
              </p>
            )}

            {app.status === "REJECTED" && app.decisionNote && (
              <p className="mt-3 text-sm text-red-600">Motivo: {app.decisionNote}</p>
            )}
          </div>
        ))}
      </div>

      <Dialog
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        title={approveTarget ? `Aprovar — ${approveTarget.customer.name}` : ""}
        description="Defina o limite concedido. Fica registrado no histórico de limite do cliente."
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setApproveTarget(null)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending} onClick={confirmApprove}>
              Confirmar aprovação
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Limite aprovado (R$)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
            />
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação interna (opcional)" rows={2} />
        </div>
      </Dialog>

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Recusar — ${rejectTarget.customer.name}` : ""}
        description="O motivo é obrigatório e fica visível pro cliente."
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending} onClick={confirmReject}>
              Confirmar recusa
            </Button>
          </>
        }
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo da recusa" rows={3} />
      </Dialog>

      <Dialog
        open={infoTarget !== null}
        onClose={() => setInfoTarget(null)}
        title={infoTarget ? `Pedir informação — ${infoTarget.customer.name}` : ""}
        description="O cliente vê esse texto e pode reenviar a solicitação complementada."
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setInfoTarget(null)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending} onClick={confirmRequestInfo}>
              Enviar pedido
            </Button>
          </>
        }
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que falta pro cliente enviar" rows={3} />
      </Dialog>
    </div>
  );
}
