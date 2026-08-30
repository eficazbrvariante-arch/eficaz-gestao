"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { setCreditoEficazExposureLimitAction, setCreditoEficazMaxInstallmentsAction } from "./actions";

/**
 * Configuração numérica simples do programa (Adendo) — mesmo padrão de
 * `defaultCommissionPercent`: `Input` + botão, sem tela própria.
 */
export function CreditoEficazConfigPanel({
  initialExposureLimit,
  initialMaxInstallments,
}: {
  initialExposureLimit: number | null;
  initialMaxInstallments: number;
}) {
  const [exposureLimit, setExposureLimit] = useState(
    initialExposureLimit != null ? String(initialExposureLimit) : ""
  );
  const [maxInstallments, setMaxInstallments] = useState(String(initialMaxInstallments));
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  function handleSaveExposureLimit() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setCreditoEficazExposureLimitAction({ limit: exposureLimit });
      setFeedback(
        result.error ? { type: "error", message: result.error } : { type: "success", message: result.success! }
      );
    });
  }

  function handleSaveMaxInstallments() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setCreditoEficazMaxInstallmentsAction({ maxInstallments: Number(maxInstallments) });
      setFeedback(
        result.error ? { type: "error", message: result.error } : { type: "success", message: result.success! }
      );
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-md border border-slate-200 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Teto global de exposição</h3>
        <p className="mb-3 text-xs text-slate-500">
          Limite máximo de exposição (limite concedido − disponível, somado de todos os clientes) que a loja
          está disposta a assumir. Deixe em branco pra não ter teto.
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Sem teto"
            value={exposureLimit}
            onChange={(e) => setExposureLimit(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={isPending}
            onClick={handleSaveExposureLimit}
            className="shrink-0 px-4"
          >
            Salvar
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Parcelas máximas (Assistência Técnica)</h3>
        <p className="mb-3 text-xs text-slate-500">
          Máximo de parcelas ao financiar o saldo de uma Ordem de Serviço com Crédito Eficaz.
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="ce-max-installments">Parcelas (1 a 12)</Label>
            <Input
              id="ce-max-installments"
              type="number"
              min={1}
              max={12}
              value={maxInstallments}
              onChange={(e) => setMaxInstallments(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={isPending}
            onClick={handleSaveMaxInstallments}
            className="mt-5 h-fit shrink-0 px-4"
          >
            Salvar
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="sm:col-span-2">
          <FormBanner message={feedback.message} variant={feedback.type} />
        </div>
      )}
    </div>
  );
}
