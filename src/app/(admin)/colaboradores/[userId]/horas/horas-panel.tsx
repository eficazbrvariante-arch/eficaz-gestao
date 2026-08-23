"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL, formatISODate } from "@/lib/format";
import { formatWorkedMinutes } from "@/modules/attendance/attendance-rules";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { setHourlyRateAction, registerHourlyPaymentAction } from "../../actions";
import type { DayWorkedMinutes } from "@/modules/employees/hourly-payment-service";

export function HorasPanel({
  userId,
  hourlyRate,
  canEditRate,
  days,
  totalMinutes,
  amount,
  hasIncompleteDays,
  from,
  to,
}: {
  userId: string;
  hourlyRate: number;
  /** Só ADMIN altera o valor por hora — mesma trava de comissão. */
  canEditRate: boolean;
  days: DayWorkedMinutes[];
  totalMinutes: number;
  amount: number;
  /** Algum dia do período tem marcação sem "saída" — total já exclui esses
   *  dias, mas registrar assim mesmo pagaria a menos sem avisar. */
  hasIncompleteDays: boolean;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rateInput, setRateInput] = useState(String(hourlyRate));
  const [transportInput, setTransportInput] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  const transportAmount = Math.max(0, Number(transportInput) || 0);
  const totalWithTransport = amount + transportAmount;

  function handleSaveRate() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setHourlyRateAction({ userId, hourlyRate: Number(rateInput) });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: "Valor por hora atualizado." });
      router.refresh();
    });
  }

  function handleRegister() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await registerHourlyPaymentAction({ userId, from, to, transportAmount });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result?.success ?? "Pagamento registrado." });
      setTransportInput("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Valor por hora</p>
        <p className="mb-3 text-xs text-slate-900">
          Usado pra calcular o pagamento a partir das horas já registradas no Ponto.
          {!canEditRate && " Somente o Administrador pode alterar."}
        </p>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Label htmlFor="hourly-rate">Valor por hora (R$)</Label>
            <Input
              id="hourly-rate"
              type="number"
              step="0.01"
              min={0}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              disabled={!canEditRate}
            />
          </div>
          {canEditRate && (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={handleSaveRate}
              fullWidth={false}
              className="px-4"
            >
              Salvar
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Horas do período</p>
        </div>
        <div className="divide-y divide-slate-100">
          {days.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-900">
              Nenhuma marcação de ponto neste período.
            </p>
          ) : (
            days.map((day) => (
              <div key={day.date} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-900">{formatISODate(day.date)}</span>
                {day.incomplete ? (
                  <span className="text-xs font-medium text-red-600">
                    Falta bater saída — corrigir no Ponto
                  </span>
                ) : (
                  <span className="font-medium text-slate-900">
                    {formatWorkedMinutes(day.workedMinutes)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="space-y-1 border-t border-slate-200 px-4 py-3">
          <div className="flex justify-between text-sm text-slate-900">
            <span>Total de horas</span>
            <span className="font-medium text-slate-900">{formatWorkedMinutes(totalMinutes)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-900">
            <span>Valor por hora</span>
            <span className="font-medium text-slate-900">{formatBRL(hourlyRate)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-sm text-slate-900">
            <span>Subtotal horas</span>
            <span className="font-medium text-slate-900">{formatBRL(amount)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Passagem (opcional)</p>
        <p className="mb-3 text-xs text-slate-900">
          Valor fixo somado ao pagamento por horas — entra no mesmo lançamento e na mesma
          confirmação/comprovante, sem precisar registrar à parte.
        </p>
        <div className="w-40">
          <Label htmlFor="transport-amount">Passagem (R$)</Label>
          <Input
            id="transport-amount"
            type="number"
            step="0.01"
            min={0}
            value={transportInput}
            onChange={(e) => setTransportInput(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-black shadow-sm">
        <span>Total a pagar</span>
        <span>{formatBRL(totalWithTransport)}</span>
      </div>

      {hasIncompleteDays && (
        <p className="text-sm text-red-600">
          Tem dia com marcação incompleta no período (sem saída batida) — corrija no Ponto antes
          de registrar, senão o total fica menor do que o real.
        </p>
      )}

      <Button
        type="button"
        disabled={isPending || totalWithTransport <= 0 || hasIncompleteDays}
        onClick={handleRegister}
        fullWidth={false}
        className="px-4"
      >
        {isPending ? "Registrando..." : `Registrar pagamento de ${formatBRL(totalWithTransport)}`}
      </Button>
    </div>
  );
}
