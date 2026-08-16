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
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rateInput, setRateInput] = useState(String(hourlyRate));
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

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
      const result = await registerHourlyPaymentAction({ userId, from, to });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result?.success ?? "Pagamento registrado." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Valor por hora</p>
        <p className="mb-3 text-xs text-slate-500">
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
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Nenhuma marcação de ponto neste período.
            </p>
          ) : (
            days.map((day) => (
              <div key={day.date} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-slate-600">{formatISODate(day.date)}</span>
                <span className="font-medium text-slate-900">
                  {formatWorkedMinutes(day.workedMinutes)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="space-y-1 border-t border-slate-200 px-4 py-3">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Total de horas</span>
            <span className="font-medium text-slate-900">{formatWorkedMinutes(totalMinutes)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>Valor por hora</span>
            <span className="font-medium text-slate-900">{formatBRL(hourlyRate)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-black">
            <span>Total a pagar</span>
            <span>{formatBRL(amount)}</span>
          </div>
        </div>
      </div>

      <Button
        type="button"
        disabled={isPending || amount <= 0}
        onClick={handleRegister}
        fullWidth={false}
        className="px-4"
      >
        {isPending ? "Registrando..." : `Registrar pagamento de ${formatBRL(amount)}`}
      </Button>
    </div>
  );
}
