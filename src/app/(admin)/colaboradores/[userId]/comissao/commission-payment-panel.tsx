"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL, formatDateTime, formatISODate } from "@/lib/format";
import { PERIOD_PICKER_DIRTY_EVENT } from "../../../relatorios/report-nav";
import {
  adjustCommissionPaymentEndAction,
  registerCommissionPaymentAction,
  undoCommissionPaymentAction,
} from "../../actions";

export type CommissionPaymentView = {
  id: string;
  amount: number;
  /** `YYYY-MM-DD` — período usado ao pagar (inclusive nas duas pontas). */
  from: string | null;
  to: string | null;
  saleCount: number;
  createdAt: Date;
  createdByName: string;
};

type Feedback = { type: "success" | "error"; message: string };

function periodLabel(from: string | null, to: string | null) {
  return from && to ? `${formatISODate(from)} a ${formatISODate(to)}` : "Período não registrado";
}

/** Pagamento cujo período toca o período da tela (datas ISO comparam como texto). */
function overlaps(payment: CommissionPaymentView, from: string, to: string) {
  return !!payment.from && !!payment.to && payment.from <= to && payment.to >= from;
}

/**
 * Faixa "Pagar comissão" da tela do vendedor (só Admin vê o botão — ver
 * `canPayCommission`). O valor é só prévia: o servidor recalcula tudo e só
 * paga venda ainda não paga. Mostra SEMPRE o período exato que vai ser pago e
 * cada pagamento já feito com início e fim — e trava o botão enquanto as
 * datas digitadas no filtro não foram aplicadas: sem "Aplicar", a tela segue
 * no período antigo e o pagamento sairia de um período diferente do que
 * aparece nos campos.
 */
export function CommissionPaymentPanel({
  userId,
  sellerName,
  from,
  to,
  unpaidAmount,
  unpaidCount,
  paidAmount,
  paidCount,
  payments,
  canPay,
}: {
  userId: string;
  sellerName: string;
  from: string;
  to: string;
  unpaidAmount: number;
  unpaidCount: number;
  paidAmount: number;
  paidCount: number;
  payments: CommissionPaymentView[];
  canPay: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [pickerDirty, setPickerDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function onDirty(event: Event) {
      setPickerDirty(Boolean((event as CustomEvent<boolean>).detail));
    }
    window.addEventListener(PERIOD_PICKER_DIRTY_EVENT, onDirty);
    return () => window.removeEventListener(PERIOD_PICKER_DIRTY_EVENT, onDirty);
  }, []);

  function pay() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await registerCommissionPaymentAction({ userId, from, to });
      setConfirmOpen(false);
      setFeedback(
        "error" in result ? { type: "error", message: result.error } : { type: "success", message: result.success }
      );
      router.refresh();
    });
  }

  const covering = payments.filter((payment) => overlaps(payment, from, to));
  const allPaid = unpaidAmount <= 0 && paidAmount > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <p className="mb-3 text-base text-slate-900">
        Período selecionado: <strong>{periodLabel(from, to)}</strong>
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-700">
          <div>
            <p>
              <span className="text-slate-500">Já pago neste período:</span>{" "}
              <span className="font-semibold text-slate-900">{formatBRL(paidAmount)}</span>
              {paidCount > 0 && <span className="text-slate-500"> ({paidCount} venda(s))</span>}
            </p>
            {covering.length > 0 && (
              <ul className="mt-1 space-y-1">
                {covering.map((payment) => (
                  <li key={payment.id} className="space-y-2 rounded bg-emerald-50 px-2 py-2 text-xs text-emerald-900">
                    <p>
                      Pagamento de <strong>{periodLabel(payment.from, payment.to)}</strong> —{" "}
                      {formatBRL(payment.amount)} · {payment.saleCount} venda(s) · pago em{" "}
                      {formatDateTime(payment.createdAt)} por {payment.createdByName}
                    </p>
                    {canPay && <PaymentRowActions payment={payment} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p>
            <span className="text-slate-500">A pagar neste período:</span>{" "}
            <span className={`font-semibold ${unpaidAmount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {formatBRL(unpaidAmount)}
            </span>
            {unpaidCount > 0 && <span className="text-slate-500"> ({unpaidCount} venda(s))</span>}
          </p>
          {allPaid && (
            <p className="font-medium text-emerald-700">
              ✓ Todas as vendas de {periodLabel(from, to)} já estão pagas.
            </p>
          )}
        </div>

        {canPay && (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="brand"
              fullWidth={false}
              disabled={isPending || unpaidAmount <= 0 || pickerDirty}
              onClick={() => setConfirmOpen(true)}
              className="px-4"
            >
              {unpaidAmount > 0
                ? `Pagar ${formatISODate(from)} a ${formatISODate(to)} · ${formatBRL(unpaidAmount)}`
                : "Nada a pagar neste período"}
            </Button>
            {pickerDirty && (
              <p className="max-w-xs text-right text-xs font-medium text-red-600">
                Você mudou as datas do filtro — clique em &quot;Aplicar&quot; antes de pagar.
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Pagar comissão — ${sellerName}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" fullWidth={false} onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="brand" fullWidth={false} disabled={isPending} onClick={pay}>
              {isPending ? "Pagando..." : `Confirmar ${formatBRL(unpaidAmount)}`}
            </Button>
          </div>
        }
      >
        <p className="mb-2 text-sm text-slate-600">Período que vai ser pago:</p>
        <p className="mb-3 text-2xl font-bold text-slate-900">
          {formatISODate(from)} a {formatISODate(to)}
        </p>
        <p className="text-sm text-slate-700">
          <strong>{formatBRL(unpaidAmount)}</strong> — {unpaidCount} venda(s) ainda não paga(s) nesse período. Se
          as datas não forem essas, clique em Cancelar, ajuste o filtro e clique em &quot;Aplicar&quot;.
        </p>
      </Dialog>
    </div>
  );
}

/**
 * "Corrigir período" + "Desfazer pagamento" de UM pagamento (só Admin) —
 * usado na caixa do topo (onde o dono olha) e no histórico do fim da página.
 * Corrigir só encurta o fim: as vendas depois voltam pra "A pagar" e a data do
 * pagamento não muda (ver `adjustCommissionPaymentEnd`).
 */
function PaymentRowActions({ payment }: { payment: CommissionPaymentView }) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const canAdjust = !!payment.from && !!payment.to && payment.from < payment.to;

  function saveAdjust() {
    if (!newTo) {
      setFeedback({ type: "error", message: "Escolha até que dia foi pago." });
      return;
    }
    setFeedback(undefined);
    startTransition(async () => {
      const result = await adjustCommissionPaymentEndAction(payment.id, newTo);
      setFeedback(
        "error" in result ? { type: "error", message: result.error } : { type: "success", message: result.success }
      );
      if (!("error" in result)) {
        setAdjusting(false);
        setNewTo("");
      }
      router.refresh();
    });
  }

  function undo() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await undoCommissionPaymentAction(payment.id);
      setConfirmUndo(false);
      setFeedback(
        "error" in result ? { type: "error", message: result.error } : { type: "success", message: result.success }
      );
      router.refresh();
    });
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {canAdjust && (
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={isPending}
            onClick={() => {
              setFeedback(undefined);
              setNewTo("");
              setAdjusting((v) => !v);
            }}
            className="px-3 py-1 text-xs"
          >
            Corrigir período
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          fullWidth={false}
          disabled={isPending}
          onClick={() => setConfirmUndo(true)}
          className="px-3 py-1 text-xs text-red-600"
        >
          Desfazer pagamento
        </Button>
      </div>

      {feedback && <p className={`mt-2 text-xs ${feedback.type === "error" ? "text-red-600" : "text-emerald-700"}`}>{feedback.message}</p>}

      {adjusting && payment.from && payment.to && (
        <div className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p className="mb-2">
            Esse pagamento começa em <strong>{formatISODate(payment.from)}</strong>. Até que dia ele foi pago de
            verdade? As vendas depois dessa data voltam para &quot;A pagar&quot;; a data do pagamento não muda.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`new-to-${payment.id}`} className="font-medium">
              Pago até
            </label>
            <input
              id={`new-to-${payment.id}`}
              type="date"
              min={payment.from}
              max={payment.to}
              value={newTo}
              onChange={(e) => setNewTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <Button
              type="button"
              fullWidth={false}
              disabled={isPending || !newTo}
              onClick={saveAdjust}
              className="px-3 py-1 text-xs"
            >
              {isPending ? "Salvando..." : newTo ? `Salvar: ${formatISODate(payment.from)} a ${formatISODate(newTo)}` : "Salvar"}
            </Button>
            <button type="button" onClick={() => setAdjusting(false)} className="text-slate-500 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={confirmUndo}
        onClose={() => setConfirmUndo(false)}
        title="Desfazer pagamento de comissão"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" fullWidth={false} onClick={() => setConfirmUndo(false)}>
              Voltar
            </Button>
            <Button type="button" variant="danger" fullWidth={false} disabled={isPending} onClick={undo}>
              {isPending ? "Desfazendo..." : "Desfazer pagamento"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          O pagamento de <strong>{periodLabel(payment.from, payment.to)}</strong> ({formatBRL(payment.amount)},{" "}
          {payment.saleCount} venda(s)) será apagado e essas vendas voltam para &quot;A pagar&quot;. Se só o período
          ficou errado, prefira &quot;Corrigir período&quot;.
        </p>
      </Dialog>
    </div>
  );
}

/**
 * Histórico de pagamentos de comissão do vendedor, com início e fim de cada
 * um, e as ações de corrigir/desfazer (só Admin).
 */
export function CommissionPaymentHistory({
  payments,
  canUndo,
}: {
  payments: CommissionPaymentView[];
  canUndo: boolean;
}) {
  return (
    <div id="pagamentos-comissao" className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Pagamentos de comissão</p>
      </div>
      {payments.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhuma comissão paga ainda.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {payments.map((payment) => (
            <div key={payment.id} className="space-y-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    De {payment.from ? formatISODate(payment.from) : "—"} até{" "}
                    {payment.to ? formatISODate(payment.to) : "—"}{" "}
                    <span className="font-normal text-slate-500">· {payment.saleCount} venda(s)</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Pago em {formatDateTime(payment.createdAt)} por {payment.createdByName}
                  </p>
                </div>
                <span className="font-semibold text-slate-900">{formatBRL(payment.amount)}</span>
              </div>
              {canUndo && <PaymentRowActions payment={payment} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
