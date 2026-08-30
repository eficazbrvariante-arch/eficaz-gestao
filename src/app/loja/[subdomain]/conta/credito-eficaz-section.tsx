"use client";

import { useState, useTransition } from "react";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { SelfieCaptureField } from "@/components/ui/selfie-capture-field";
import { formatBRL, formatDate } from "@/lib/format";
import { submitCreditoEficazApplicationAction } from "./actions";
import type { CustomerCreditSummary } from "@/modules/credito-eficaz/credito-eficaz-service";

type ApplicationRow = {
  id: string;
  status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "INFO_REQUESTED" | "REJECTED" | "BLOCKED";
  decisionNote: string | null;
  createdAt: Date;
};

const BEST_DUE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function CreditoEficazSection({
  subdomain,
  summary,
  latestApplication,
}: {
  subdomain: string;
  summary: CustomerCreditSummary | null;
  latestApplication: ApplicationRow | null;
}) {
  const [occupation, setOccupation] = useState("");
  const [income, setIncome] = useState("");
  const [bestDueDay, setBestDueDay] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [idDocumentPathname, setIdDocumentPathname] = useState("");
  const [residenceProofPathname, setResidenceProofPathname] = useState("");
  const [selfiePathname, setSelfiePathname] = useState("");
  const [pin, setPin] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const hasApprovedCredit = !!summary && summary.limitAmount > 0;
  const uploadUrl = `/loja/${subdomain}/api/credito-eficaz/upload`;

  function handleSubmit() {
    setFeedback(undefined);
    if (!termsAccepted) {
      setFeedback({ type: "error", message: "Aceite os termos para continuar." });
      return;
    }
    if (!idDocumentPathname || !residenceProofPathname || !selfiePathname) {
      setFeedback({ type: "error", message: "Envie os três documentos pedidos." });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setFeedback({ type: "error", message: "O PIN precisa ter exatamente 4 dígitos." });
      return;
    }

    startTransition(async () => {
      const result = await submitCreditoEficazApplicationAction(subdomain, {
        occupation,
        income: income || undefined,
        bestDueDay: bestDueDay || undefined,
        additionalNotes,
        idDocumentPathname,
        residenceProofPathname,
        selfiePathname,
        pin,
        termsAccepted: true,
      });
      if ("error" in result && result.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({
        type: "success",
        message: "Solicitação enviada! Vamos avisar quando ela for analisada.",
      });
      setShowForm(false);
    });
  }

  if (hasApprovedCredit && summary) {
    return (
      <div className="mb-8 rounded-xl border border-slate-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Crédito Eficaz</h2>
        {summary.blocked && (
          <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
            Seu Crédito Eficaz está temporariamente bloqueado
            {summary.blockedReason ? `: ${summary.blockedReason}` : "."} Fale com a loja se tiver
            dúvidas.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Limite total</p>
            <p className="font-semibold text-slate-900">{formatBRL(summary.limitAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Utilizado</p>
            <p className="font-semibold text-slate-900">{formatBRL(summary.usedAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Disponível</p>
            <p className="font-semibold text-emerald-700">{formatBRL(summary.availableAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Em aberto</p>
            <p className="font-semibold text-slate-900">{formatBRL(summary.openAmount)}</p>
          </div>
        </div>
        {summary.nextDueDate && (
          <p className="mt-3 text-xs text-slate-500">
            Próximo vencimento: {formatDate(summary.nextDueDate)}
          </p>
        )}
        {summary.eficazNumber && (
          <p className="mt-1 text-xs text-slate-400">Seu Número Eficaz: {summary.eficazNumber}</p>
        )}
      </div>
    );
  }

  if (latestApplication?.status === "UNDER_REVIEW") {
    return (
      <div className="mb-8 rounded-xl border border-slate-200 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Crédito Eficaz</h2>
        <p className="text-sm text-amber-700">
          Sua solicitação está em análise. Avisamos assim que houver uma decisão.
        </p>
      </div>
    );
  }

  const showFormNow = showForm || latestApplication?.status === "INFO_REQUESTED";

  return (
    <div className="mb-8 rounded-xl border border-slate-200 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Crédito Eficaz</h2>

      {latestApplication?.status === "REJECTED" && (
        <p className="mb-2 text-sm text-red-600">
          Sua última solicitação foi recusada
          {latestApplication.decisionNote ? `: ${latestApplication.decisionNote}` : "."} Você pode
          solicitar novamente quando quiser.
        </p>
      )}

      {latestApplication?.status === "INFO_REQUESTED" && (
        <p className="mb-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          A loja pediu mais informações pra continuar sua análise
          {latestApplication.decisionNote ? `: ${latestApplication.decisionNote}` : "."} Complete os
          dados abaixo e reenvie.
        </p>
      )}

      {!showFormNow && (
        <>
          <p className="mb-3 text-sm text-slate-500">
            Linha de crédito própria da loja, com limite definido pela loja e uso direto no caixa.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            Solicitar Crédito Eficaz
          </button>
        </>
      )}

      {showFormNow && (
        <div className="space-y-3 rounded-md bg-slate-50 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Profissão/ocupação</label>
            <input
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Renda mensal (opcional)</label>
              <input
                type="number"
                min={0}
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Melhor dia de vencimento</label>
              <select
                value={bestDueDay}
                onChange={(e) => setBestDueDay(e.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">Sem preferência</option>
                {BEST_DUE_DAYS.map((day) => (
                  <option key={day} value={day}>
                    Dia {day}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observação (opcional)</label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={2}
              disabled={isPending}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Documento de identificação (RG ou CNH)</label>
            <ImageUploadField
              value={idDocumentPathname || undefined}
              onChange={setIdDocumentPathname}
              uploadUrl={uploadUrl}
              access="private"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Comprovante de residência</label>
            <ImageUploadField
              value={residenceProofPathname || undefined}
              onChange={setResidenceProofPathname}
              uploadUrl={uploadUrl}
              access="private"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Selfie de confirmação</label>
            <SelfieCaptureField
              onCaptured={setSelfiePathname}
              uploadUrl={uploadUrl}
              access="private"
              disabled={isPending}
            />
            {selfiePathname && <p className="mt-1 text-xs text-emerald-700">Selfie enviada.</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Crie um PIN de 4 dígitos (vai confirmar o uso do crédito no caixa)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={isPending}
              className="w-28 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm tracking-widest"
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Termos do Crédito Eficaz</summary>
            <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p>
                O Crédito Eficaz é uma linha de crédito da própria loja, com limite definido
                manualmente pela loja após análise do seu cadastro e documentos. Nenhuma aprovação
                é automática.
              </p>
              <p>
                O uso no caixa exige o PIN definido acima. Cada compra usando o Crédito Eficaz gera
                uma obrigação de pagamento com vencimento definido pela loja; atraso pode bloquear
                temporariamente novos usos, sem afetar suas compras já feitas.
              </p>
              <p>
                Seus documentos e selfie ficam armazenados de forma privada, acessíveis só à loja
                pra fins de análise de crédito — nunca publicados ou compartilhados.
              </p>
            </div>
          </details>

          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>Li e aceito os termos do Crédito Eficaz.</span>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-400"
            style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
          >
            {isPending ? "Enviando..." : "Enviar solicitação"}
          </button>
        </div>
      )}

      {feedback && (
        <p className={`mt-2 text-xs ${feedback.type === "error" ? "text-red-600" : "text-emerald-700"}`}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
