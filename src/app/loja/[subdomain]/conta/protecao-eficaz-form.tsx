"use client";

import { useState, useTransition } from "react";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { formatDate } from "@/lib/format";
import { submitProtecaoEficazAction } from "./actions";
import type { CustomerProtecaoEficazRow } from "@/modules/protecao-eficaz/protecao-eficaz-service";

const STATUS_LABEL: Record<CustomerProtecaoEficazRow["status"], string> = {
  PENDING: "Em análise",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

const STATUS_CLASS: Record<CustomerProtecaoEficazRow["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
};

export function ProtecaoEficazSection({
  subdomain,
  registrations,
}: {
  subdomain: string;
  registrations: CustomerProtecaoEficazRow[];
}) {
  const [saleNumber, setSaleNumber] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setFeedback(undefined);
    if (!termsAccepted) {
      setFeedback({ type: "error", message: "Aceite os termos para continuar." });
      return;
    }
    if (!photoUrl) {
      setFeedback({ type: "error", message: "Envie uma foto da nota." });
      return;
    }
    startTransition(async () => {
      const result = await submitProtecaoEficazAction(subdomain, {
        saleNumber,
        proofPhotoUrl: photoUrl,
        termsAccepted: true,
      });
      if ("error" in result && result.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({
        type: "success",
        message: "Cadastro enviado! Vamos avisar quando for validado.",
      });
      setSaleNumber("");
      setPhotoUrl("");
      setTermsAccepted(false);
    });
  }

  return (
    <div className="mb-8 rounded-xl border border-slate-200 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Proteção Eficaz</h2>
      <p className="mb-1 text-sm text-slate-500">
        Comprou capinha + película e optou pela Proteção Eficaz no caixa (em vez do desconto)?
        Cadastre a nota aqui pra validar sua garantia de troca da película em até 30 dias da
        data de emissão da nota.
      </p>

      <details className="mb-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Como funciona?</summary>
        <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            Na compra, você escolhe: levar o <strong>desconto na película</strong> na hora, ou
            abrir mão dele e ganhar a <strong>Proteção Eficaz</strong> — o direito de trocar a
            película uma vez, sem custo, dentro de 30 dias a partir da data de emissão da nota.
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>No caixa, peça pro vendedor marcar a Proteção Eficaz no cupom.</li>
            <li>Crie sua conta aqui no site (ou entre, se já tiver).</li>
            <li>Volte nesta tela e informe o número da venda (no cupom) + uma foto da nota.</li>
            <li>Aceite os termos e envie — a loja confere e libera a garantia.</li>
          </ol>
          <p>
            Só vale quando a nota tem capinha <strong>e</strong> película juntas, e só um
            cadastro por nota. Promoção válida a partir de 17/08/2026.
          </p>
        </div>
      </details>

      {registrations.length > 0 && (
        <ul className="mb-4 space-y-2">
          {registrations.map((reg) => (
            <li
              key={reg.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3 text-sm"
            >
              <div>
                <span className="font-medium text-slate-900">Venda #{reg.saleNumber}</span>
                <span className="ml-2 text-xs text-slate-400">{formatDate(reg.createdAt)}</span>
                {reg.status === "REJECTED" && reg.rejectionReason && (
                  <p className="mt-0.5 text-xs text-red-600">{reg.rejectionReason}</p>
                )}
                {reg.status === "APPROVED" && (
                  <p className="mt-0.5 text-xs text-emerald-700">
                    {reg.redeemedAt
                      ? `Troca já realizada em ${formatDate(reg.redeemedAt)}.`
                      : reg.protectionExpiresAt
                        ? `Válido para troca até ${formatDate(reg.protectionExpiresAt)}.`
                        : null}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[reg.status]}`}>
                {STATUS_LABEL[reg.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-md bg-slate-50 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Número da venda (no seu cupom)
          </label>
          <input
            type="number"
            min={1}
            value={saleNumber}
            onChange={(e) => setSaleNumber(e.target.value)}
            placeholder="Ex.: 123"
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Foto da nota</label>
          <ImageUploadField
            value={photoUrl || undefined}
            onChange={setPhotoUrl}
            uploadUrl={`/loja/${subdomain}/api/protecao-eficaz/upload`}
            disabled={isPending}
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            Aceito os termos da Proteção Eficaz — válido uma única vez por nota, apenas pra
            vendas com capinha e película juntas.
          </span>
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-400"
          style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
        >
          {isPending ? "Enviando..." : "Enviar cadastro"}
        </button>

        {feedback && (
          <p className={`text-xs ${feedback.type === "error" ? "text-red-600" : "text-emerald-700"}`}>
            {feedback.message}
          </p>
        )}
      </div>
    </div>
  );
}
