"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL, formatISODate } from "@/lib/format";
import { formatWorkedMinutes } from "@/modules/attendance/attendance-rules";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormBanner } from "@/components/ui/form-banner";
import { setHourlyRateAction, registerHourlyPaymentAction } from "../../actions";
import type { DayWorkedMinutes, HourlyPaymentHistoryEntry } from "@/modules/employees/hourly-payment-service";

export function HorasPanel({
  userId,
  hourlyRate,
  canEditRate,
  days,
  totalMinutes,
  amount,
  hasIncompleteDays,
  hasOpenToday,
  from,
  to,
  effectiveFrom,
  coveredThrough,
  fullyCovered,
  history,
  advancePending,
  purchasePending,
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
  /** `true` quando hoje está no período e ainda sem "saída" batida —
   *  registrar agora congelaria o dia de hoje como já coberto e as horas
   *  trabalhadas depois deste momento nunca mais entrariam em nenhum
   *  pagamento futuro. Bloqueia o botão de registrar. */
  hasOpenToday: boolean;
  from: string;
  to: string;
  /** Início realmente usado no cálculo — depois de `from` quando parte do
   *  período já tinha pagamento registrado. */
  effectiveFrom: string;
  /** Fim do último pagamento por horas já registrado (pendente ou pago),
   *  ou `null` se nunca houve um. */
  coveredThrough: string | null;
  /** `true` quando o período pedido inteiro já está coberto — nada pendente. */
  fullyCovered: boolean;
  history: HourlyPaymentHistoryEntry[];
  /** Adiantamento de salário pendente deste colaborador — só informativo,
   *  descontado do "Líquido a receber" aqui, sem quitar o lançamento. */
  advancePending: number;
  /** Compra de mercadoria pendente deste colaborador — mesmo tratamento. */
  purchasePending: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rateInput, setRateInput] = useState(String(hourlyRate));
  const [transportInput, setTransportInput] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  const transportAmount = Math.max(0, Number(transportInput) || 0);
  const totalWithTransport = amount + transportAmount;
  const deductionsPending = advancePending + purchasePending;
  const netAmount = Math.max(0, totalWithTransport - deductionsPending);

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

      {coveredThrough && (
        <p className="rounded-md bg-info/10 px-3 py-2 text-sm text-info">
          {fullyCovered
            ? `Todo o período pedido já tem pagamento registrado (até ${formatISODate(coveredThrough)}). Nada pendente aqui — veja o histórico abaixo.`
            : `Já tem pagamento registrado até ${formatISODate(coveredThrough)} — mostrando só as horas pendentes a partir de ${formatISODate(effectiveFrom)}.`}
        </p>
      )}

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

      {deductionsPending > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-slate-900">
            Descontos pendentes (o que ela deve à loja)
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Só informativo — não muda o que é registrado ao clicar em &quot;Registrar
            pagamento&quot; abaixo. Pra quitar de fato, marque o Adiantamento/Mercadoria como
            pago na tabela de Lançamentos, em Colaboradores.
          </p>
          <div className="space-y-1 text-sm">
            {advancePending > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>Adiantamento pendente</span>
                <span>-{formatBRL(advancePending)}</span>
              </div>
            )}
            {purchasePending > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>Mercadoria pendente</span>
                <span>-{formatBRL(purchasePending)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-black">
              <span>Líquido a receber</span>
              <span>{formatBRL(netAmount)}</span>
            </div>
            {totalWithTransport - deductionsPending < 0 && (
              <p className="pt-1 text-xs text-red-600">
                O desconto é maior que as horas dessa vez — o restante (
                {formatBRL(deductionsPending - totalWithTransport)}) continua pendente pra ser
                descontado depois.
              </p>
            )}
          </div>
        </div>
      )}

      {hasIncompleteDays && (
        <p className="text-sm text-red-600">
          Tem dia com marcação incompleta no período (sem saída batida) — corrija no Ponto antes
          de registrar, senão o total fica menor do que o real.
        </p>
      )}

      {hasOpenToday && (
        <p className="text-sm text-red-600">
          O expediente de hoje ainda está aberto (sem saída batida) — espere o colaborador bater a
          saída antes de registrar. Registrando agora, as horas trabalhadas depois deste momento
          nunca entrariam em nenhum pagamento futuro.
        </p>
      )}

      <Button
        type="button"
        disabled={isPending || totalWithTransport <= 0 || hasIncompleteDays || hasOpenToday}
        onClick={handleRegister}
        fullWidth={false}
        className="px-4"
      >
        {isPending ? "Registrando..." : `Registrar pagamento de ${formatBRL(totalWithTransport)}`}
      </Button>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Histórico de pagamentos</p>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-900">
            Nenhum pagamento por horas registrado ainda.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  {entry.paidSelfieUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- selfie em blob storage, domínio variável
                    <img
                      src={entry.paidSelfieUrl}
                      alt="Selfie de confirmação"
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {entry.from && entry.to
                        ? `${formatISODate(entry.from)} a ${formatISODate(entry.to)}`
                        : "Período não registrado"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.status === "PAID" && entry.settledAt
                        ? `Pago em ${formatISODate(entry.settledAt.toISOString().slice(0, 10))}`
                        : `Lançado em ${formatISODate(entry.createdAt.toISOString().slice(0, 10))}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">{formatBRL(entry.amount)}</span>
                  <Badge variant={entry.status === "PAID" ? "success" : "warning"}>
                    {entry.status === "PAID" ? "Pago" : "Pendente"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
