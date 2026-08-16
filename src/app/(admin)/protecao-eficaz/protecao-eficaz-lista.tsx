"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import {
  approveProtecaoEficazAction,
  rejectProtecaoEficazAction,
  markProtecaoEficazRedeemedAction,
} from "./actions";
import type { AdminProtecaoEficazRow } from "@/modules/protecao-eficaz/protecao-eficaz-service";

const STATUS_BADGE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

const STATUS_LABEL = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
} as const;

export function ProtecaoEficazLista({ registrations }: { registrations: AdminProtecaoEficazRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [rejectTarget, setRejectTarget] = useState<AdminProtecaoEficazRow | null>(null);
  const [reason, setReason] = useState("");

  function approve(id: string) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await approveProtecaoEficazAction(id);
      setFeedback(
        result.error ? { type: "error", message: result.error } : { type: "success", message: result.success! }
      );
      router.refresh();
    });
  }

  function confirmReject() {
    if (!rejectTarget) return;
    setFeedback(undefined);
    startTransition(async () => {
      const result = await rejectProtecaoEficazAction(rejectTarget.id, reason);
      setRejectTarget(null);
      setFeedback(
        result.error ? { type: "error", message: result.error } : { type: "success", message: result.success! }
      );
      router.refresh();
    });
  }

  function markRedeemed(id: string) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await markProtecaoEficazRedeemedAction(id);
      setFeedback(
        result.error ? { type: "error", message: result.error } : { type: "success", message: result.success! }
      );
      router.refresh();
    });
  }

  if (registrations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
        Nenhum cadastro de Proteção Eficaz ainda.
      </div>
    );
  }

  return (
    <div>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="space-y-4">
        {registrations.map((reg) => (
          <div key={reg.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium text-slate-900">{reg.customerName}</span>
                {reg.customerPhone && <span className="ml-2 text-xs text-slate-400">{reg.customerPhone}</span>}
                <span className="ml-2 text-xs text-slate-400">Enviado em {formatDateTime(reg.createdAt)}</span>
              </div>
              <Badge variant={STATUS_BADGE[reg.status]}>{STATUS_LABEL[reg.status]}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Venda #{reg.saleNumber} — rascunho do sistema
                </p>
                {!reg.sale.found ? (
                  <p className="text-sm text-red-600">Nenhuma venda #{reg.saleNumber} encontrada.</p>
                ) : (
                  <>
                    <p className="mb-1 text-xs text-slate-500">
                      {reg.sale.createdAt && formatDateTime(reg.sale.createdAt)} · Vendedor: {reg.sale.sellerName}
                    </p>
                    <ul className="mb-2 space-y-0.5 text-xs text-slate-700">
                      {reg.sale.items.map((item, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span>
                            {item.quantity}× {item.name}
                          </span>
                          <span>{formatBRL(item.total)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={reg.sale.hasCapinha ? "success" : "danger"}>
                        {reg.sale.hasCapinha ? "Tem capinha" : "Sem capinha"}
                      </Badge>
                      <Badge variant={reg.sale.hasPelicula ? "success" : "danger"}>
                        {reg.sale.hasPelicula ? "Tem película" : "Sem película"}
                      </Badge>
                      <Badge variant={reg.sale.protecaoEficazOptedIn ? "success" : "warning"}>
                        {reg.sale.protecaoEficazOptedIn
                          ? "Marcado no PDV"
                          : "Não marcado no PDV"}
                      </Badge>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">Foto enviada pelo cliente</p>
                <a href={reg.proofPhotoUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- domínio dinâmico do Vercel Blob */}
                  <img
                    src={reg.proofPhotoUrl}
                    alt="Foto da nota enviada pelo cliente"
                    className="h-40 w-full rounded-md border border-slate-200 object-contain"
                  />
                </a>
              </div>
            </div>

            {reg.status === "PENDING" && (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  fullWidth={false}
                  disabled={isPending}
                  onClick={() => approve(reg.id)}
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
                    setRejectTarget(reg);
                    setReason("");
                  }}
                  className="px-4"
                >
                  Rejeitar
                </Button>
              </div>
            )}

            {reg.status === "APPROVED" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  {reg.redeemedAt
                    ? `Troca registrada em ${formatDateTime(reg.redeemedAt)}.`
                    : reg.protectionExpiresAt
                      ? `Válido para troca até ${formatDate(reg.protectionExpiresAt)}.`
                      : null}
                </p>
                {!reg.redeemedAt && (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    disabled={isPending}
                    onClick={() => markRedeemed(reg.id)}
                    className="px-4"
                  >
                    Marcar como trocado
                  </Button>
                )}
              </div>
            )}

            {reg.status === "REJECTED" && reg.rejectionReason && (
              <p className="mt-3 text-sm text-red-600">Motivo: {reg.rejectionReason}</p>
            )}
          </div>
        ))}
      </div>

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Rejeitar — ${rejectTarget.customerName}` : ""}
        description="O motivo fica registrado no cadastro."
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending} onClick={confirmReject}>
              Confirmar rejeição
            </Button>
          </>
        }
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (opcional)"
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </Dialog>
    </div>
  );
}
